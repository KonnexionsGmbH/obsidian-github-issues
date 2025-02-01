import { App, Notice, Plugin, PluginSettingTab, Setting, View, Editor, WorkspaceLeaf } from "obsidian";
import {
	api_authenticate,
	api_get_issues_by_id,
	api_get_own_issues,
	RepoItem,
	Label
} from "./API/ApiHandler";
import { IssuesModal } from "./Elements/Modals/IssuesModal";
import { Octokit } from "@octokit/core";
import { updateIssues } from "./Issues/IssueUpdater";
import { NewIssueModal } from "./Elements/Modals/NewIssueModal";
import { IssueItems } from "./Elements/IssueItems";
import { Issue, TaskLabels, getIssueSortKey } from "./Issues/Issue";
import { Feature, Task } from "./Tasks/Tasks";
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

function finishTask(this_task: string, tacc: Task[], i: number): string {
	// may be called without open task(this_task == "")
	if (this_task.length > 0) {
		if (tacc[tacc.length - 1].end == 0) {
			tacc[tacc.length - 1].end = i;
		} else {
			console.log("Cannot re-finish in finishTask")
		}
	} else if (tacc.length > 0) {
		if (tacc[tacc.length - 1].end == 0) {
			console.log("this_task is empty in finishTask()")
		}
	};
	this_task = "";
	return this_task;
}

function startNewTask(this_task: string, tacc: Task[], i: number, line: string): string {
	if (this_task.length > 0) {
		finishTask(this_task, tacc, i);
	}
	// - [ ] #task One more task #Core #Server #102 🔺 🛫 2025-02-01 ✅ 2025-01-31
	// - [ ] #task One more task #Core #Server #102 🔼 🛫 2025-02-01
	// - [ ] #task One more task #Core #Server #102 🔽 🛫 2025-02-01
	// - [ ] #task One more task #Core #Server ⏫
	// - [ ] #task One more task #Core #Server #102 🔺 🔁 every day 🛫 2025-02-01 ❌ 2025-01-31
	// - [ ] #task One more task #Core #Server #102 ⏬ 🛫 2025-02-01
	// - [x] #task Description comes here 🆔 uo7126 ⛔ t3ls4p ⏫ ➕ 2025-02-03 ⏳ 2025-01-24 📅 2025-02-07

	const prios = "⏬🔽 🔼⏫🔺";		// prio0 .. prio5, prio2 = normal doesnot happen
	const dates = "➕⏳📅🛫✅❌🔁";
	const links = "⛔🆔";
	const task_pos = line.indexOf("#task");
	const title_pos = task_pos + 6;
	const words: string[] = line.substring(title_pos).split(" ");
	let mapped_labels: Label[] = [];
	let titles: string[] = [];
	let done = false;
	words.forEach((word) => {
		if (done == false) {
			let prio = prios.indexOf(word.substring(0, 1));
			if (prio > 3) {
				mapped_labels.push({
					name: "p_critical",
					color: "#D93F0B"
				} as Label);
				done = true;
			} else if (prio > 2) {
				mapped_labels.push({
					name: "p_high",
					color: "#E99695"
				} as Label);
				done = true;
			} else if (prio > 0) {
				mapped_labels.push({
					name: "p_low",
					color: "#9CE8C6"
				} as Label);
				done = true;
			} else if (prio == 0) {
				mapped_labels.push({
					name: "p_backlog",
					color: "#49EE25"
				} as Label);
				done = true;
			}
			if (dates.contains(word)) {
				done = true;
			} else if (links.contains(word)) {
				done = true;
			} else if (word.startsWith("#")) {
				mapped_labels.push({
					name: word,
					color: "#FFFFFF"
				} as Label);
			} else {
				titles.push(word);
			}
		}
	})
	this_task = titles.join(" ");
	const tl = new TaskLabels(mapped_labels);
	tacc.push(new Task(i, 0, this_task, tl, getIssueSortKey(this_task, tl), line.substring(task_pos - 3, task_pos - 2)));
	return this_task;
}


function finishFeature(this_feature: string, this_task: string, facc: Feature[], tacc: Task[], i: number): string {

	if (facc[facc.length - 1].tag == this_feature) {
		tacc[tacc.length - 1].end = i;
		facc[facc.length - 1].end = i;
		if (this_task.length > 0) {
			finishTask(this_task, tacc, i);
		}
		facc[facc.length - 1].tasks = tacc;
		tacc = [];
	} else {
		console.log("Tag not matching in finishFeature()");
	}
	this_feature = "";
	return this_feature;
}

function startNewFeature(this_feature: string, this_task: string, facc: Feature[], tacc: Task[], i: number, line: string): string {
	if (this_feature.length > 0) {
		finishFeature(this_feature, this_task, facc, tacc, i);
	}
	const words = line.split(" ");
	this_feature = words[1];
	facc.push(new Feature(i, 0, this_feature, false, []));
	return this_feature;
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
				const rows = source.split("\n").filter((row) => row.length > 0);
				const repoName = rows[0].split("/")[1].split("#")[0];
				const owner = rows[0].split("/")[0];

				//parse if the user only wants to embed a single/some issues or all of them
				const parsedIssues = parseIssuesToEmbed(rows[0]);
				const repo: RepoItem = {
					owner: owner,
					name: repoName,
					id: 0,
					language: "",
					updated_at: "",
				};

				if (this.settings.show_searchbar) {
					const searchfield = el.createEl("input");
					searchfield.setAttribute("type", "text");
					searchfield.setAttribute(
						"placeholder",
						"Search Titles, Labels,...",
					);
					searchfield.classList.add("issues-searchfield");

					searchfield.addEventListener("input", () => {
						//go through the children of "el" and hide all that don't match the search if the search is empty show all
						const search = searchfield.value.toLowerCase();
						el.childNodes.forEach((child) => {
							if (child instanceof HTMLElement) {
								if (
									child.innerText
										.toLowerCase()
										.includes(search)
								) {
									child.style.display = "flex";
								} else if (child !== searchfield) {
									child.style.display = "none";
								}
							}
						});
					});
				}

				let issues: Issue[] = [];
				if (parsedIssues.length != 0) {
					issues = await api_get_issues_by_id(
						this.octokit,
						repo,
						parsedIssues,
					);
				} else {
					issues = await api_get_own_issues(this.octokit, repo);
				}

				issues = issues.sort((s1, s2) => {
					if (s1.sort_string > s2.sort_string) {
						return 1;
					}
					if (s1.sort_string < s2.sort_string) {
						return -1;
					}
					return 0;
				})
				var this_feature = "";
				var this_task = "";
				var facc: Feature[] = [];
				var tacc: Task[] = [];
				this.app.workspace.iterateRootLeaves((leaf) => {
					if ((leaf.getDisplayText() == "IO-XPA Releases") && (leaf.getViewState().type == "markdown")) {
						this.app.workspace.setActiveLeaf(leaf, { focus: false });
						if (leaf.view) {
							const editor = leaf.view.editor;
							console.log("EditorLineCount: ", editor.lineCount());
							for (let i = 0; i < editor.lineCount(); i++) {
								let line = editor.getLine(i);
								if (this_feature == "") { // look for a new feature
									if ((line.indexOf("#hidden") == -1) && (line.startsWith("### #"))) {
										this_feature = startNewFeature(this_feature, this_task, facc, tacc, i, line);
										this_task = "";
										tacc = [];
									}	// ignore tasks and arbitrary lines without task heading
								} else { // look for the end of the last feature
									if ((line.indexOf("#hidden") == -1) && (line.startsWith("### #"))) { // new feature
										this_feature = startNewFeature(this_feature, this_task, facc, tacc, i, line);
										this_task = "";
										tacc = [];
									} else if (line.startsWith("####")) {
										// skip headings of levels 4,5 and 6. May belong to features or tasks
									} else if (line.startsWith("#")) {
										this_feature = finishFeature(this_feature, this_task, facc, tacc, i);
									} else if ((line.indexOf("#task") > 3) && (line.contains("- ["))) {
										this_task = startNewTask(this_task, tacc, i, line); // but finish this_task first if needed
									}
								}
							}
							if (this_feature.length > 0) {
								this_feature = finishFeature(this_feature, this_task, facc, tacc, editor.lineCount());
							}
							console.log(facc);
						}
					}
				})

				issues.forEach((issue) => {
					switch (this.settings.issue_appearance) {
						case IssueAppearance.DEFAULT:
							IssueItems.createDefaultIssueElement(
								el,
								issue,
								this.octokit,
								this.app,
							);
							break;
						case IssueAppearance.COMPACT:
							IssueItems.createCompactIssueElement(
								el,
								issue,
								this.octokit,
								this.app,
							);
							break;
					}
				});
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
