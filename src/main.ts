import { App, Notice, Plugin, PluginSettingTab, Setting, Editor, FileSystemAdapter} from "obsidian";
import {
	api_authenticate,
	api_get_own_issues,
	api_get_labels,
	Label,
	api_create_new_label,
	api_set_labels_on_issue
} from "./API/ApiHandler";
import { IssuesModal } from "./Elements/Modals/IssuesModal";
import { Octokit } from "@octokit/core";
import { updateIssues } from "./Issues/IssueUpdater";
import { NewIssueModal } from "./Elements/Modals/NewIssueModal";
import { IssueItems, createBadTaskAlert } from "./Elements/IssueItems";
import { Issue, ClassLabels, IssueSortOrder, sortIssues, allProperLabels } from "./Issues/Issue";
import { Feature, parseTaskNote, collectBadTaskAlerts, sortAndPruneTasksNote, issueToTaskSync, issueToForeignTaskSync, taskToIssueSync } from "./Tasks/Tasks";
import { errors } from "./Messages/Errors";
import { reRenderView } from "./Utils/Utils";

//enum for the appearance of the issues when pasted into the editor
export enum IssueAppearance {
	DEFAULT = "default",
	COMPACT = "compact",
}

interface MyPluginSettings {
	username: string;
	password: string;
	issue_appearance: IssueAppearance;
	show_searchbar: boolean;
	api_endpoint: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	username: "",
	password: "",
	issue_appearance: IssueAppearance.DEFAULT,
	show_searchbar: true,
	api_endpoint: "https://api.github.com",
};

/**
 * IssueViewParams class
 */
export class IssueViewParams {
	owner: 			string;				// organisation owning the repo
	repo:			string;				// repository name
	file_name: 		string;				// tasks note (#ReleasesNote)
	task_token: 	string = "#task";	// e.g. #task from Tasks plugin config
	hidden_token:	string = "#hidden";	// e.g. #hidden used for features
	product_tokens: string[] = [];		// for products in this repo
	foreign_tokens: string[] = []; 		// for products in other repos

/* Sample config
```github-issues
io-swiss/io-niesen
IO-XPA Releases
#task
#hidden
#App/io-ax4
#Intelligence/io-intelligence
#PM
#Repo
#Core
#Server
#User
```
*/
    constructor(source: string[]) {
        this.owner = source[0].split("/")[0];
        this.repo  = source[0].split("/")[1].trim();
        this.file_name = "";

		if (source.length > 1) { 
			// console.log("File name: ", source[1]);
			this.file_name = source[1].trim()
		};
		if (source.length > 2) { 
			// console.log("Task token: ", source[2]);
			this.task_token = source[2].trim()
		};
		if (source.length > 3) { 
			// console.log("Hidden token: ", source[3]);
			this.hidden_token = source[3].trim()
		};
		if (source.length > 4) {
			for (let i = 4; i < source.length; i++) {
				const words = source[i].trim().split("/");
				if ((words.length > 1) && (words[1] == this.repo)) {
					// console.log("Product token: ", source[i]);
					this.product_tokens.push(words[0].trim());
				} else if (words.length == 1) {
					// console.log("Product token: ", source[i]);
					this.product_tokens.push(words[0].trim());
				} else {
					// console.log("Foreign token: ", source[i]);
					this.foreign_tokens.push(words[0].trim())
				}
			}
		}
		console.log(this);
	}
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	octokit: Octokit = new Octokit({ auth: "" });

/*			
	getAbsolutePath(fileName: string): string {
		let basePath;
		let relativePath;
		// base path
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			basePath = this.app.vault.adapter.getBasePath();
		} else {
			throw new Error('Cannot determine base path.');
		}
		// relative path
		relativePath = `${this.app.vault.configDir}/plugins/linked-data-vocabularies/${fileName}`;
		// absolute path
		return `${basePath}/${relativePath}`;
	}
*/
	async onload() {

		await this.loadSettings();
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new GithubIssuesSettings(this.app, this));

		if (this.settings.password == "" || this.settings.username == "") {
			new Notice(
				"Please enter your username and password in the settings.",
			);
		} else {
			try {
				this.octokit = (await api_authenticate(this.settings.password, this.settings.api_endpoint))
					? new Octokit({ auth: this.settings.password })
					: new Octokit({ auth: "" });
				if (!this.octokit) {
					new Notice(
						"Authentication failed. Please check your Git credentials in the plugin credentials.",
					);
				}
			} catch (e) {
				new Notice(
					"Authentication failed. Please check your Git in the plugin credentials.",
				);
			}
		}

		//register markdown post processor
		this.registerMarkdownCodeBlockProcessor(
			"github-issues",
			async (source, el) => {
				const view_params = new IssueViewParams(source.split("\n").filter((row) => row.length > 0));

				if (this.settings.show_searchbar) {
					const searchfield = el.createEl("input");
					searchfield.setAttribute("type", "text");
					searchfield.setAttribute("placeholder", "Search Titles, Labels,...",);
					searchfield.classList.add("main-issues-searchfield");

					searchfield.addEventListener("input", () => {
						// go through the children of "el" and hide all that don't match the search 
						// if the search is empty show all
						const search = searchfield.value.toLowerCase();
						el.childNodes.forEach((child) => {
							if (child instanceof HTMLElement) {
								if (child.innerText.toLowerCase().includes(search)) {
									child.style.display = "block";
								} else if (child !== searchfield) {
									child.style.display = "none";
								}
							}
						});
					});
				}

				const allRepoLabelsPromise: Promise<ClassLabels> = api_get_labels(this.octokit, view_params);

				const openIssuesPromise: Promise<Issue[]> = api_get_own_issues(this.octokit, view_params);

				let open_issue_count = -1;

				let editor: Editor;
				let facc: Feature[] = [];
				this.app.workspace.iterateRootLeaves((leaf) => {
					if ((leaf.getDisplayText() == view_params.file_name) && (leaf.getViewState().type == "markdown")) {
						this.app.workspace.setActiveLeaf(leaf, { focus: true });
						if (leaf.view) {							
							editor = leaf.view.editor;  // VSCode sees a problem here but it works
							facc = parseTaskNote(editor, view_params, facc);
							console.log("facc after load/parse");
							console.log(structuredClone(facc));
						}
					}
				})

/*
				const task_config_path = this.getAbsolutePath(".obsidian/plugins/obsidian-tasks-plugin/data.json");
				console.log(task_config_path);
		  
				if (this.app.vault.adapter instanceof FileSystemAdapter) {
				  let basePath = this.app.vault.adapter.getBasePath();
				  console.log(basePath);
				}
*/			  

				let issues: Issue[] = await openIssuesPromise;
				
				open_issue_count = issues.length;

				// sortIssues(issues, IssueSortOrder.feature);

				let repo_class_labels: ClassLabels = await allRepoLabelsPromise;

				// console.log(repo_class_labels);

				if (facc.length > 0)  {
					const repo_labels = new Set<string>();
					repo_class_labels.feature_labels.forEach((label) => {
						repo_labels.add(label.name);
					});

					const missing_labels = new Set<string>();
					facc.forEach((feature) => {
						if (!repo_labels.has(feature.tag)) {
								missing_labels.add(feature.tag);						
						}
					});

					// console.log("Missing Labels in GitHub: ", missing_labels);

					missing_labels.forEach(async (name) => {
						const created = await api_create_new_label(
							this.octokit,
							view_params,
							name
						);		
						if (created) {
							repo_class_labels.feature_labels.push({
								name: name,
								color: "aaaaaa"
							} as Label);
							new Notice("New label created: " + name);
						} else {
							new Notice("New label creation failed :" + name);
						}
					});

					if (view_params.product_tokens.length == 1) {
						// this repo has only one product, we can assume this product label for all issues
						const product_color = repo_class_labels.product_labels.find(l => l.name == view_params.product_tokens[0])?.color;
						for (let i = 0; i < issues.length; i++) {
							if (issues[i].cls.product_labels.length == 0) {
								issues[i].cls.product_labels.push({ name: view_params.product_tokens[0], color: product_color } as Label);
								const selectedTokens = allProperLabels(issues[i].cls).map((label) => label.name) ;
								const updated = await api_set_labels_on_issue(this.octokit, issues[i], selectedTokens);
								if (updated) {
									new Notice("Default label updated");
								} else {
									new Notice("Could not update default label");
								}	
							}
						}					
					}
	
					const [bad_tasks_alerts, set_ids, set_titles] = collectBadTaskAlerts(facc, view_params);

					console.log("bad_tasks_alerts: ", bad_tasks_alerts);
					// console.log(set_ids);
					// console.log(set_titles);

					if (bad_tasks_alerts.length > 0) {
						const bt = `The synchronisation from GitHub to Obsidian has been aborted because of below mentioned consistency errors in ${view_params.file_name}.
						Please correct those. The GitHub Issues list which follows may help you with that.`;
						createBadTaskAlert(el, bt);
						bad_tasks_alerts.forEach((bt) => createBadTaskAlert(el, bt) );
					} else {

						let iids: string[] = [];
						for (let i=0; i < issues.length; i++) {
							issueToTaskSync(issues[i], view_params, editor, facc, set_ids, set_titles);
							iids.push("#" + issues[i].number); // index for taskToIssueSync

							/* to be implemented
							if (issues[i].cls.foreign_labels.length > 0) {
								issueToForeignTaskSync(issues[i], view_params, editor, facc, set_ids, set_titles);
							}
							*/
						}
						sortAndPruneTasksNote( editor, facc, view_params);
						console.log("facc after issueToTaskSync/sort");
						console.log(structuredClone(facc));

						for (let f=0; f < facc.length; f++) {
							if (!facc[f].hidden) {
								for (let t = 0; t < facc[f].tasks.length; t++) {
									let task = facc[f].tasks[t];
									if (task.cts.product_tokens.length > 0) {
										// task refers to this repo
										await taskToIssueSync(task, this.octokit, view_params, editor, issues, 
											iids, bad_tasks_alerts, this.settings.username, set_ids);
									}
								}
							}
						}

						console.log("facc after taskToIssueSync");
						console.log(structuredClone(facc));

						if (bad_tasks_alerts.length > 0) {
							const bt = 'The synchronisation from Obsidian to GitHub failed (at least partially). Please check the following findings.';
							createBadTaskAlert(el, bt);
							bad_tasks_alerts.forEach((bt) => createBadTaskAlert(el, bt) );
						}
					}
				};

				if (open_issue_count == 100) {

					const bi = 'The repo contains more than 100 open issues. This alone leads to some of the finding reported below. Please do not leave issues open longer than necessary.';
					createBadTaskAlert(el, bi);

				} else if (issues.some( issue => issue.findings.length > 0 )) {

					const bi = 'The task/issue checker had some findings. You may want to fix them now or later on whichever appropriate side. Look for red marks on the right border and more info in the detail modal comment text';
					createBadTaskAlert(el, bi);
				};
				
				sortIssues(issues, IssueSortOrder.feature);
				
				issues.forEach((issue) => {
					IssueItems.createDefaultIssueElement(
						el,
						issue,
						repo_class_labels,
						this.octokit,
						this.app,
					)});
			},
		);

		//add issues of repo command
		this.addCommand({
			id: "embed-issues",
			name: "Embed open Issues",
			callback: () => {
				if (this.octokit) {
					//check if repo already exists in file
					new IssuesModal(this.app, {
						octokit: this.octokit,
						plugin_settings: this.settings,
					} as OctoBundle).open();
				} else {
					new Notice(errors.noCreds);
				}
			},
		});

		this.addCommand({
			id: "update-issues",
			name: "Force-update Issues",
			callback: () => {
				if (this.octokit) {
					new Notice("Updating issues...");
					updateIssues(this.app);
				} else {
					new Notice(errors.noCreds);
				}
			},
		});

		this.addCommand({
			id: "new-issue",
			name: "Create new Issue",
			callback: () => {
				if (this.octokit) {
					new NewIssueModal(this.app, {
						octokit: this.octokit,
						plugin_settings: this.settings,
					} as OctoBundle).open();
				} else {
					new Notice(errors.noCreds);
				}
			},
		});
	}

	// onunload() {
	//
	// }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class GithubIssuesSettings extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Github Authentication" });

		containerEl
			.createSpan({
				text: "To use this plugin, you need to create a personal access token. You can find a guide on how to do that in the ",
			})
			.createEl("a", {
				text: "README.",
				href: "https://github.com/Frostplexx/obsidian-github-issues#prerequisites",
			});

		// username
		new Setting(containerEl)
			.setName("Username")
			.setDesc("Your Github Username or Email")
			.addText((text) =>
				text
					.setPlaceholder("John Doe")
					.setValue(this.plugin.settings.username)
					.onChange(async (value) => {
						// console.log("Username: " + value);
						this.plugin.settings.username = value;
						await this.plugin.saveSettings();
						this.plugin.octokit = (await api_authenticate(
							this.plugin.settings.password,
							this.plugin.settings.api_endpoint,
						))
							? new Octokit({
								auth: this.plugin.settings.password,
							})
							: new Octokit({});
						if (
							this.plugin.octokit &&
							this.plugin.settings.password
						) {
							new Notice("Successfully authenticated!");
						}
					}),
			);


		// password
		new Setting(containerEl)
			.setName("Personal Authentication Token")
			.setDesc("Personal Authentication Token")
			.addText((text) =>
				text
					.setPlaceholder("XXXXXXXXXXXXXXX")
					.setValue(this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.password = value;
						await this.plugin.saveSettings();
						//trigger reauthentication
						this.plugin.octokit = (await api_authenticate(
							this.plugin.settings.password,
							this.plugin.settings.api_endpoint,
						))
							? new Octokit({
								auth: this.plugin.settings.password,
							})
							: new Octokit({});
						if (
							this.plugin.octokit &&
							this.plugin.settings.username
						) {
							new Notice("Successfully authenticated!");
						}
					}),
			);

		// github api endpoint
		new Setting(containerEl)
			.setName("Github API URL")
			.setDesc("The url of the github api. Default is https://api.github.com")
			.addText((text) =>
				text
					.setPlaceholder("https://api.github.com")
					.setValue(this.plugin.settings.api_endpoint)
					.onChange(async (value) => {
						this.plugin.settings.api_endpoint = value;
						await this.plugin.saveSettings();
						//trigger reauthentication
						this.plugin.octokit = (await api_authenticate(
							this.plugin.settings.password,
							this.plugin.settings.api_endpoint,
						))
							? new Octokit({
								auth: this.plugin.settings.password,
							})
							: new Octokit({});
						if (
							this.plugin.octokit &&
							this.plugin.settings.username
						) {
							new Notice("Successfully authenticated!");
						}
					}),
			);

		containerEl.createEl("h2", { text: "Appearance" });
		new Setting(containerEl)
			.setName("Issues Appearance")
			.setDesc("How should the issues be displayed?")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(IssueAppearance.DEFAULT, "Default")
					.addOption(IssueAppearance.COMPACT, "Compact")
					.setValue(this.plugin.settings.issue_appearance)
					.onChange(async (value: IssueAppearance) => {
						// console.log("Appearance: " + value);
						this.plugin.settings.issue_appearance = value;
						await this.plugin.saveSettings();

						reRenderView(this.app);

					}),
			);
		new Setting(containerEl)
			.setName("Show Searchbar")
			.setDesc("Show a searchbar above the issues in the embed.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.show_searchbar)
					.onChange(async (value) => {
						// console.log("Show Searchbar: " + value);
						this.plugin.settings.show_searchbar = value;
						await this.plugin.saveSettings();

						reRenderView(this.app);
					}),
			);
	}
}

export interface OctoBundle {
	octokit: Octokit;
	plugin_settings: MyPluginSettings;
}
