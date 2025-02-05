import { App, Notice, Plugin, PluginSettingTab, Setting, MarkdownView, Editor} from "obsidian";
import {
	api_authenticate,
	api_get_own_issues,
	api_get_labels,
	RepoItem,
	Label,
	api_create_new_label
} from "./API/ApiHandler";
import { IssuesModal } from "./Elements/Modals/IssuesModal";
import { Octokit } from "@octokit/core";
import { updateIssues } from "./Issues/IssueUpdater";
import { NewIssueModal } from "./Elements/Modals/NewIssueModal";
import { IssueItems, createBadTaskAlert } from "./Elements/IssueItems";
import { Issue, TaskLabels, IssueSortOrder, sortIssues } from "./Issues/Issue";
import { Feature, Task, parseTaskNote, collectBadTaskAlerts } from "./Tasks/Tasks";
import { errors } from "./Messages/Errors";
import { parseIssuesToEmbed } from "./Issues/Issues.shared";
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

/* Sample config

```github-issues
io-swiss/io-niesen
IO-XPA Releases
#task
#hidden
#App/io-ax4
#Core
#Server
#User
```

*/

/**
 * IssueViewParams class
 */
export class IssueViewParams {
	owner: 		string;
	repo:		string;
	file_name: 	string;					// tasks note
	task_token: string = "#task";		// e.g. #task
	hidden_token: string = "#hidden";	// e.g. #hidden
	repo_tokens: string[] = [];			// for this repo
	other_tokens: string[] = []; 		// for other repos

    constructor(source: string[]) {
        this.owner = source[0].split("/")[0];
        this.repo  = source[0].split("/")[1].trim();
        this.file_name = "";
        // this.task_token = "#task";
        // this.hidden_token = "#hidden";
        // this.repo_tokens = [];
		// this.other_tokens = [];

		if (source.length > 1) { 
			console.log("File name: ", source[1]);
			this.file_name = source[1].trim()
		};
		if (source.length > 2) { 
			console.log("Task token: ", source[2]);
			this.task_token = source[2].trim()
		};
		if (source.length > 3) { 
			console.log("Hidden token: ", source[3]);
			this.hidden_token = source[3].trim()
		};
		if (source.length > 4) {
			for (let i = 4; i < source.length; i++) {
				const words = source[i].trim().split("/");
				if ((words.length > 1) && (words[1] == this.repo)) {
					console.log("Repo token: ", source[i]);
					this.repo_tokens.push(words[0].trim());
				} else if (words.length == 1) {
					console.log("Repo token: ", source[i]);
					this.repo_tokens.push(words[0].trim());
				} else {
					console.log("Other token: ", source[i]);
					this.other_tokens.push(words[0].trim())
				}
			}
		}
	}
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	octokit: Octokit = new Octokit({ auth: "" });

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

				const repo: RepoItem = {
					owner: view_params.owner,
					name: view_params.repo,
					id: 0,
					language: "",
					updated_at: "",
				};

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
									child.style.display = "flex";
								} else if (child !== searchfield) {
									child.style.display = "none";
								}
							}
						});
					});
				}

				const allLabelsPromise: Promise<TaskLabels> = api_get_labels(this.octokit, view_params);

				let issues: Issue[] = await api_get_own_issues(this.octokit, view_params);

				sortIssues(issues, IssueSortOrder.feature);

				let editor: Editor;
				let facc: Feature[] = [];
				this.app.workspace.iterateRootLeaves((leaf) => {
					if ((leaf.getDisplayText() == "IO-XPA Releases") && (leaf.getViewState().type == "markdown")) {
						this.app.workspace.setActiveLeaf(leaf, { focus: false });
						if (leaf.view) {							
							editor = leaf.view.editor;		// compiler sees a problem here but it works
							facc = parseTaskNote(editor, view_params);
						}
					}
				})

				let all_labels: TaskLabels = await allLabelsPromise;
				if (facc.length > 0)  {
					const repo_labels = new Set<string>();
					all_labels.feature_labels.forEach((label) => {
						repo_labels.add(label.name);
					});

					//console.log("Labels in GitHub: ", repo_labels);

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
							repo,
							name
						);		
						if (created) {
							all_labels.feature_labels.push({
								name: name,
								color: "aaaaaa"
							} as Label);
							new Notice("New label created: " + name);
						} else {
							new Notice("New label creation failed :" + name);
						}
					  });

					  const bad_tasks_alerts: string[] = collectBadTaskAlerts(facc, view_params);

					  console.log("bad_tasks_alerts: ", bad_tasks_alerts);

					  bad_tasks_alerts.forEach((bt) => {
						createBadTaskAlert(el, bt);
					  });

					  if (bad_tasks_alerts.length > 0) {
						const bt = `The synchronisation between Obsidian and GitHub has been aborted because of above mentioned consistency errors in ${view_params.file_name}.
						Please correct those. The issue state in GitHub below may help you with that.`;
						createBadTaskAlert(el, bt);
					  }

				};


				issues.forEach((issue) => {
					IssueItems.createDefaultIssueElement(
						el,
						issue,
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
						console.log("Username: " + value);
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
						console.log("Appearance: " + value);
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
						console.log("Show Searchbar: " + value);
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
