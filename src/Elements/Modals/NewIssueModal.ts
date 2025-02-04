import { App, Modal, Notice, setIcon } from "obsidian";
import { OctoBundle } from "../../main";
import { getRepoInFile, updateIssues } from "../../Issues/IssueUpdater";
import {
	api_get_labels,
	api_submit_issue,
	RepoItem,
	SubmittableIssue,
} from "../../API/ApiHandler";
import { loadingSpinner } from "../../Utils/Loader";

/*
 * Modal for creating a new issue inside obsidian
 */
export class NewIssueModal extends Modal {
	ocotoBundle: OctoBundle;
	constructor(app: App, ocotoBundle: OctoBundle) {
		super(app);
		this.ocotoBundle = ocotoBundle;
	}

	async onOpen() {
		//get the repo name from the current file
		const repo: () => RepoItem | null = () => {
			const repo = getRepoInFile(this.app);
			if (!repo) return null;
			return {
				name: repo.repo,
				owner: repo.name,
			} as RepoItem;
		};

		if (repo()) {
			const { contentEl } = this;
			contentEl.createEl("h2", {
				text: "New Issue in: " + repo()?.owner + "/" + repo()?.name,
			});
			const spinner = loadingSpinner();
			contentEl.appendChild(spinner);
			//get the labels
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const task_labels = (
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				await api_get_labels(this.ocotoBundle.octokit, repo()!)
			);

			spinner.remove();
			//title input field
			const titleInput = contentEl.createEl("input");
			titleInput.setAttribute("type", "text");
			titleInput.setAttribute("placeholder", "Title");
			titleInput.classList.add("new-issue-title-input");
			//description input field
			const descriptionInput = contentEl.createEl("textarea");
			descriptionInput.setAttribute("type", "text");
			descriptionInput.setAttribute("placeholder", "Description");
			descriptionInput.classList.add("new-issue-description-input");

			//selected labels field
			const selectedLabels = contentEl.createEl("div");
			selectedLabels.classList.add("new-issue-selected-labels");

			//dropdown where you can select multiple labels
			const labelDropdown = contentEl.createEl("select");
			labelDropdown.classList.add("new-issue-label-dropdown");

			//add the labels to the dropdown
			labelDropdown.createEl("option", {
				value: "Select Labels",
				text: "Select Labels",
			});

			for (const label of task_labels.feature_labels) {
				const option = labelDropdown.createEl("option");
				option.setAttribute("value", label.name);
				option.text = label.name;
			}

			let elements: string[] = [];

			//add the selected label to the selected labels field
			labelDropdown.addEventListener("change", () => {
				const value = labelDropdown.value;
				labelDropdown.value = "Select Labels";
				const tag = selectedLabels.createEl("div");
				tag.classList.add("new-issue-tag");
				//create button to remove the tag
				tag.createEl("span", { text: value });
				const removeButton = tag.createEl("button");
				removeButton.classList.add("new-issue-remove-button");
				setIcon(removeButton, "x");

				removeButton.onclick = () => {
					selectedLabels.removeChild(tag);
					elements = elements.filter((e) => e !== value);
					labelDropdown.childNodes.forEach((node: ChildNode) => {
						if (node instanceof HTMLOptionElement) {
							if (node.value === value) {
								node.disabled = false;
							}
						}
					});
				};
				elements.push(value);
				labelDropdown.childNodes.forEach((node: ChildNode) => {
					if (node instanceof HTMLOptionElement) {
						if (node.value === value) {
							node.disabled = true;
						}
					}
				});
			});

			//submit button
			const submitButton = contentEl.createEl("button", {
				text: "Submit",
			});

			//submit the issue
			submitButton.addEventListener("click", async () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const submitted = await api_submit_issue(
					this.ocotoBundle.octokit,
					repo(),
					{
						labels: elements,
						title: titleInput.value,
						description: descriptionInput.value,
					} as SubmittableIssue,
				);

				if (submitted) {
					new Notice("Submitted Issue");
					this.close();
					await updateIssues(this.app);
				} else {
					new Notice("Failed to submit issue");
				}
			});
		} else {
			new Notice("You are not in a GitHub repo");
			this.close();
		}
	}
}
