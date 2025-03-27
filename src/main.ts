import { 
	App, 
	Notice, 
	Plugin, 
	PluginSettingTab, 
	Setting, 
	Editor,
	FileSystemAdapter } from "obsidian";

import { 
	Octokit } from "@octokit/core";
	
import {
	api_authenticate,
	api_get_own_issues,
	api_get_labels,
	Label,
	api_create_new_label,
	api_set_labels_on_issue } from "./API/ApiHandler";

import { 
	Issue, 
	ClassLabels, 
	IssueSortOrder, 
	sortIssues, 
	allProperLabels } from "./Issues/Issue";

import {
	IssueItems, 
	createBadTaskAlert, 
	setTaskStates } from "./Elements/IssueItems";
	
import {
	MyTaskStatus, 
	Feature, 
	parseTaskNote, 
	collectBadTaskAlerts, 
	sortAndPruneTasksNote, 
	issueToTaskSync, 
	taskToIssueSync,
	issueToForeignTaskSync } from "./Tasks/Tasks";

import { 
	nesv, 
	reRenderView } from "./Utils/Utils";

import * as fs from 'fs';	

import * as path from 'path';	

interface MyPluginSettings {
	username: string;
	password: string;
	show_searchbar: boolean;
	api_endpoint: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	username: "",
	password: "",
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

/* Sample query block config
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
			this.file_name = source[1].trim()
		};
		if (source.length > 2) { 
			this.task_token = source[2].trim()
		};
		if (source.length > 3) { 
			this.hidden_token = source[3].trim()
		};
		if (source.length > 4) {
			for (let i = 4; i < source.length; i++) {
				const words = source[i].trim().split("/");
				if ((words.length > 1) && (words[1] == this.repo)) {
					this.product_tokens.push(words[0].trim());
				} else if (words.length == 1) {
					this.product_tokens.push(words[0].trim());
				} else {
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
	git_user: string | undefined;
	git_pat: string | undefined;
	task_states: MyTaskStatus[] = [];

	async onload() {

		let plugin_init = !this.settings;  // first call of onload()

		await this.loadSettings();
		this.git_user = process.env.GIT_USER;
		this.git_pat = process.env.GIT_PAT;
		if (this.git_user && this.git_pat) {
			console.log('Loading with credential defaults in environment.')
			// console.log("GIT_USER: ", this.git_user);
			// console.log("GIT_PAT: ", this.git_pat);
		} else {
			console.log('Loading without credential defaults in environment.')
		}

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new GithubIssuesSettings(this.app, this));

		if (!(this.settings.username) && !(this.git_user)) {
			new Notice("Please enter your username and password in the settings.");
		} else if (!(this.settings.password) && !(this.git_pat)) {
			new Notice("Please enter your password in the settings.");
		} else {
			try {
				this.octokit = (await api_authenticate(nesv(this.settings.password, this.git_pat), this.settings.api_endpoint))
					? new Octokit({ auth: nesv(this.settings.password, this.git_pat) })
					: new Octokit({ auth: "" });
				if (!this.octokit) {
					new Notice("Authentication failed. Please check your Git credentials in the plugin credentials.");
				}
			} catch (e) {
				new Notice("Authentication failed. Please check your Git in the plugin credentials.");
			}
		}

		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			try {
				const dataFilePath = path.join(
					this.app.vault.adapter.getBasePath(),
					this.app.vault.configDir ,
					"plugins",
					"obsidian-tasks-plugin",
					"data.json"
				);
				const tasks_settings_data = fs.readFileSync(dataFilePath, "utf8");
				const tasks_config = JSON.parse(tasks_settings_data);
				this.task_states = tasks_config.statusSettings.customStatuses;
				setTaskStates(this.task_states); // static in IssueItems
				// console.log("this.task_states: ", this.task_states);
					
			} catch (error) {
				const msg = "Cannot find Tasks plugin custom settings";
				new Notice(msg);
				console.log(msg, error);
			}
		} else {
			const msg = "Cannot access file system and Tasks plugin config";
			new Notice(msg);
			console.log(msg);
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
				let issues: Issue[] = [];
				try {
					issues = await openIssuesPromise;					
				} catch (error) {
					issues = [];
					console.log(error);
					el.createEl("h4", { text: `Could not connect to GitHub repo ${view_params.owner + "/" + view_params.repo}` });
					el.createEl("body", { text: "Please check:"});
					el.createEl("body", { text: " * GitHub user and personal access token in the plugin config or in OS User environment variables." });
					el.createEl("body", { text: " * Query parameters in this document:" });
					el.createEl("body", { text: " 1 - owner/repo" });
					el.createEl("body", { text: " 2 - task note file name (e.g. IO-XPA Releases) " });
					el.createEl("body", { text: " 3 - task tag (e.g. #task)" });
					el.createEl("body", { text: " 4 - hidden feature tag (e.g. #hidden)" });
					el.createEl("body", { text: " 5++ product/repo tokens (e.g. #App/repo)" });
				}
				
				open_issue_count = issues.length;

				// Check if we find the note with the tasks (release plan for features and their tasks)
				// This note must be open in the workspace (side by side to the dynamic issue query)
				let editor: Editor | undefined;
				let facc: Feature[] = [];
				this.app.workspace.iterateRootLeaves((leaf) => {
					if ( editor == undefined
						&& (leaf.getDisplayText() == view_params.file_name) 
						&& (leaf.getViewState().type == "markdown")) {
						this.app.workspace.setActiveLeaf(leaf, { focus: true });
						if (leaf.view) {							
							editor = leaf.view.editor;  // VSCode sees a problem here but it works
							if (editor) {
								facc = parseTaskNote(editor, view_params, facc);
								console.log("facc after load/parse");
								console.log(structuredClone(facc));
							}
						}
					}
				})

				let repo_class_labels: ClassLabels = await allRepoLabelsPromise;

				if ( editor && (facc.length > 0) )  {
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
					if (!plugin_init) {
						if (view_params.product_tokens.length == 1) {
							// this repo has only one product, we can assume this product label for all issues
							const product_color = repo_class_labels.product_labels.find(l => l.name == view_params.product_tokens[0])?.color;
							for (let i = 0; i < issues.length; i++) {
								if (issues[i].cls.product_labels.length == 0) {
									issues[i].cls.product_labels.push({ name: view_params.product_tokens[0], color: product_color } as Label);
									const selectedTokens = allProperLabels(issues[i].cls).map((label) => label.name) ;
									const updated = await api_set_labels_on_issue(this.octokit, view_params, issues[i], selectedTokens);
									if (updated) {
										new Notice("Default label updated");
									} else {
										new Notice("Could not update default label");
									}	
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
							if (!plugin_init) {
								issueToTaskSync(issues[i], view_params, editor, facc, this.task_states, set_ids, set_titles);

								/* to be implemented
								if (issues[i].cls.foreign_labels.length > 0) {
									issueToForeignTaskSync(issues[i], view_params, editor, facc, set_ids, set_titles);
								}
								*/
							}
							iids.push("#" + issues[i].number); // index for taskToIssueSync
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
										if (!plugin_init) {
											await taskToIssueSync(task, this.octokit, view_params, editor, issues, 
												iids, bad_tasks_alerts, this.settings.username, this.task_states, set_ids);
										}
									}
								}
							}
						}
						if (!plugin_init) {
							console.log("facc after taskToIssueSync");
							console.log(structuredClone(facc));
						}
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
						view_params,
						repo_class_labels,
						this.octokit,
						this.app,
					)});
			},
		);
		plugin_init = false;
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

		containerEl.createSpan({
				text: "To use this plugin, you need to create a personal access token PAT (which needs to be re-created from time to time). You can find a guide on how to do that in the ",
			}).createEl("a", {
				text: "README.",
				href: "https://github.com/KonnexionsGmbH/obsidian-github-issues#prerequisites",
			});

		containerEl.createEl("h2", {
				text: "You can leave GIT username and PAT empty and provide them in OS environment variables and thereby prevent sensitive data to be synchronized to other vault users."
			});

		// username
		new Setting(containerEl)
			.setName("Username")
			.setDesc("Your Github Username or Email, default is OS-env 'GIT_USER' (if defined)")
			.addText((text) =>
				text
					.setPlaceholder("OS-Env: GIT_USER")
					.setValue(this.plugin.settings.username)
					.onChange(async (value) => {
						this.plugin.settings.username = value;
						await this.plugin.saveSettings();
						//trigger reauthentication
						this.plugin.octokit = (await api_authenticate(
							nesv(this.plugin.settings.password, this.plugin.git_pat),
							this.plugin.settings.api_endpoint,
						))
							? new Octokit({
								auth: nesv(this.plugin.settings.password, this.plugin.git_pat),
							})
							: new Octokit({});
						if (
							this.plugin.octokit &&
							nesv(this.plugin.settings.password, this.plugin.git_pat)
						) {
							new Notice("Successfully authenticated!");
						}
					}),
			);


		// password
		new Setting(containerEl)
			.setName("Personal Authentication Token")
			.setDesc("Personal Authentication Token, default is OS-env 'GIT_PAT' (if defined)")
			.addText((text) =>
				text
					.setPlaceholder("OS-Env: GIT_PAT")
					.setValue(this.plugin.settings.password)
					.onChange(async (value) => {
						this.plugin.settings.password = value;
						await this.plugin.saveSettings();
						//trigger reauthentication
						this.plugin.octokit = (await api_authenticate(
							nesv(this.plugin.settings.password, this.plugin.git_pat),
							this.plugin.settings.api_endpoint,
						))
							? new Octokit({
								auth: nesv(this.plugin.settings.password, this.plugin.git_pat),
							})
							: new Octokit({});
						if (
							this.plugin.octokit &&
							nesv(this.plugin.settings.username, this.plugin.git_user)
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
							nesv(this.plugin.settings.password, this.plugin.git_pat),
							this.plugin.settings.api_endpoint,
						))
							? new Octokit({
								auth: nesv(this.plugin.settings.password, this.plugin.git_pat),
							})
							: new Octokit({});
						if (
							this.plugin.octokit &&
							nesv(this.plugin.settings.username, this.plugin.git_user)
						) {
							new Notice("Successfully authenticated!");
						}
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
