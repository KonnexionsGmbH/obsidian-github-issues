import { App, Component, MarkdownRenderer, Modal, Notice } from "obsidian";
import { TaskLabels, Issue } from "../../Issues/Issue";
import { Octokit } from "@octokit/core";
import { getPasteableTimeDelta, reRenderView } from "../../Utils/Utils";
import { loadingSpinner } from "../../Utils/Loader";
import {
	api_comment_on_issue,
	api_get_issue_comments,
	api_get_issue_details,
	api_update_issue,
	api_get_labels,
	api_set_labels_on_issue,
	Label
} from "../../API/ApiHandler";
import { updateIssues } from "../../Issues/IssueUpdater";
import { getTextColor } from "../../Utils/Color.utils";

/**
 * Modal for seeing the issue details
 */
export class IssuesDetailsModal extends Modal {
	issue: Issue;
	octokit: Octokit;
	constructor(app: App, issue: Issue, octokit: Octokit) {
		super(app);
		this.issue = issue;
		this.octokit = octokit;
	}

	async onOpen() {
		const { contentEl } = this;

		const titleInput = contentEl.createEl("textarea", { text: this.issue.title });
		titleInput.classList.add("issues-title-input");

		contentEl.createEl("br");

		const saveTitleButton = contentEl.createEl("button", { text: "Save Title" });
		saveTitleButton.classList.add("save-button");

		this.showButtonOnInputChange(titleInput, saveTitleButton, this.issue.title);

		const repoAndId = contentEl.createSpan({
			text: this.issue.repo?.name + ` issue #` + this.issue.number
		});
		repoAndId.classList.add("issues-repo")

		saveTitleButton.onclick = async () => {
			const updated = await api_update_issue(this.octokit, this.issue, {
				title: titleInput.value
			});
			if (updated) {
				// reRenderView(this.app);
				new Notice("Issue Title updated");
			} else {
				new Notice("Could not update issue");
			}
		}

		contentEl.createEl("br");
		const authorAndCreateDate = contentEl.createSpan({
			text: `Created by ${this.issue.author} ${getPasteableTimeDelta(this.issue.created_at)}`
		});
		authorAndCreateDate.classList.add("issues-author")

		contentEl.createEl("br");
		const issueLink = contentEl.createEl("a", { text: "View on GitHub" });
		issueLink.setAttribute("href", "https://github.com/" + this.issue.repo?.owner + "/" + this.issue.repo?.name + "/issues/" + this.issue.number);
		issueLink.classList.add("issue-link")
		const spinner = loadingSpinner();
		contentEl.appendChild(spinner);

		//fetch the issue details
		const details = await api_get_issue_details(this.octokit, this.issue);
		spinner.remove();
		if (!details) {
			contentEl.createEl("h3", { text: "Could not fetch issue details" });
			return;
		}

		const stateAndLabelsContainer = contentEl.createDiv();
		stateAndLabelsContainer.classList.add("issues-state-and-label-container")

		const statePill = stateAndLabelsContainer.createDiv();
		statePill.classList.add("issues-state-pill")
		//make it green if state is open
		if (details?.state === "open") {
			statePill.style.backgroundColor = "rgba(31, 118, 41, 0.5)";
		} else {
			statePill.style.backgroundColor = "rgba(116, 58, 222, 0.5)";
		}

		const state = statePill.createEl("span", { text: details?.state });
		state.classList.add("issues-state")

		const labels = stateAndLabelsContainer.createDiv();
		labels.classList.add("issues-labels")

		const mapped_labels = details.labels.map((label: any) => {
			return {
				name: label.name,
				color: label.color
			} as Label;
		})
		const tl = new TaskLabels(mapped_labels);
		const sorted_labels: Label[] = tl.feature_labels.concat(tl.normal_labels).concat(tl.platform_labels);

		//loop through the labels
		// eslint-disable-next-line no-unsafe-optional-chaining
		for (const label of sorted_labels) {
			const labelPill = labels.createDiv();
			labelPill.classList.add("issues-label-pill")
			labelPill.style.background = "#" + label.color;
			const labelName = labelPill.createEl("span", { text: label.name });
			labelName.classList.add("issues-label-name")
			labelName.style.color = getTextColor(label.color);
		}

		const labelsGrid = contentEl.createDiv();
		labelsGrid.classList.add("labels-grid");

		if (this.issue.repo != null) {
			const allLabels = await api_get_labels(this.octokit, this.issue.repo);
			const originalSelections = new Set(details.labels.map(label => label.name));
			const checkboxes: HTMLInputElement[] = [];

			for (let i = 0; i < allLabels.length; i += 2) {
				const row = labelsGrid.createDiv();
				row.classList.add("labels-row");

				// First label
				const labelContainer1 = row.createDiv();
				labelContainer1.classList.add("label-grid-container");
				const labelCheckbox1 = labelContainer1.createEl("input", {
					type: "checkbox",
					value: allLabels[i].name
				});
				labelCheckbox1.checked = originalSelections.has(allLabels[i].name);
				checkboxes.push(labelCheckbox1);
				const labelLabel1 = labelContainer1.createEl("label", { text: allLabels[i].name });
				labelLabel1.htmlFor = allLabels[i].name;

				// Second label (if exists)
				if (i + 1 < allLabels.length) {
					const labelContainer2 = row.createDiv();
					labelContainer2.classList.add("label-grid-container");
					const labelCheckbox2 = labelContainer2.createEl("input", {
						type: "checkbox",
						value: allLabels[i + 1].name
					});
					labelCheckbox2.checked = originalSelections.has(allLabels[i + 1].name);
					checkboxes.push(labelCheckbox2);
					const labelLabel2 = labelContainer2.createEl("label", { text: allLabels[i + 1].name });
					labelLabel2.htmlFor = allLabels[i + 1].name;
				}
			}

			const saveLabelsButton = contentEl.createEl("button", { text: "Save Labels" });
			saveLabelsButton.classList.add("save-button");

			const checkForChanges = () => {
				const currentSelections = new Set(
					checkboxes
						.filter(cb => cb.checked)
						.map(cb => cb.value)
				);

				const hasChanges =
					originalSelections.size !== currentSelections.size ||
					![...originalSelections].every(label => currentSelections.has(label));

				if (hasChanges) {
					saveLabelsButton.classList.add("visible");
				} else {
					saveLabelsButton.classList.remove("visible");
				}
			};

			checkboxes.forEach(checkbox => {
				checkbox.addEventListener("change", checkForChanges);
			});

			saveLabelsButton.onclick = async () => {
				const selectedLabels = Array.from(labelsGrid.querySelectorAll("input:checked")).map((checkbox: HTMLInputElement) => checkbox.value);
				console.log(selectedLabels);
				const updated = await api_set_labels_on_issue(this.octokit, this.issue, selectedLabels);
				if (updated) {
					new Notice("Labels updated");
					this.close();
				} else {
					new Notice("Could not update labels");
				}
			};
		}


		if (details.assignee.login != undefined) {
			const assigneeContainer = contentEl.createDiv();
			assigneeContainer.classList.add("issues-asignee-container")

			//assignee icon
			const assigneeIcon = assigneeContainer.createEl("img");
			assigneeIcon.classList.add("issues-assignee-icon")
			assigneeIcon.src = details?.assignee.avatar_url;

			//asignee login
			const assignee = assigneeContainer.createSpan({
				text: `Assigned to ${details?.assignee.login}`
			});
			assignee.classList.add("issues-assignee")
		}

		const descriptionContainer = contentEl.createDiv();
		descriptionContainer.classList.add("description-container");

		const descriptionInput = descriptionContainer.createEl("textarea", { text: details.body });
		descriptionInput.classList.add("issues-description-input");
		descriptionInput.rows = Math.min(details.body.split('\n').length, 10);

		const previewContainer = descriptionContainer.createDiv();
		previewContainer.classList.add("description-preview");
		previewContainer.style.display = "none";

		const toggleButton = descriptionContainer.createEl("button", { text: "Preview" });
		toggleButton.classList.add("toggle-preview-button");

		toggleButton.addEventListener("click", async () => {
			if (previewContainer.style.display === "none") {
				// Switch to preview
				previewContainer.empty();
				await MarkdownRenderer.renderMarkdown(
					descriptionInput.value, 
					previewContainer, 
					"", 
					Component.prototype
				);
				descriptionInput.style.display = "none";
				previewContainer.style.display = "block";
				toggleButton.setText("Edit");
			} else {
				// Switch to edit
				descriptionInput.style.display = "block";
				previewContainer.style.display = "none";
				toggleButton.setText("Preview");
			}
		});

		const saveDescriptionButton = contentEl.createEl("button", { text: "Save Description" });
		saveDescriptionButton.classList.add("save-button");

		this.showButtonOnInputChange(descriptionInput, saveDescriptionButton, details.body);

		saveDescriptionButton.onclick = async () => {
			const updated = await api_update_issue(this.octokit, this.issue, {
				body: descriptionInput.value
			});
			if (updated) {
				// reRenderView(this.app);
				new Notice("Issue Description updated");
			} else {
				new Notice("Could not update issue");
			}
		}

		//load the comments 
		// MarkdownRenderer.render(this.app, details?.body, body, "", Component.prototype);

		//load the comments
		const spinner2 = loadingSpinner();
		contentEl.appendChild(spinner2);
		const comments = await api_get_issue_comments(this.octokit, this.issue);
		spinner2.remove();
		if (!comments) {
			contentEl.createEl("h3", { text: "Could not fetch comments" });
			return;
		}

		if (comments.length > 0) {
			contentEl.createEl("h3", { text: "Comments" });
		}

		comments.forEach(comment => {
			const commentsContainer = contentEl.createDiv();
			commentsContainer.classList.add("issues-comments-container")

			const authorContainer = commentsContainer.createDiv();
			authorContainer.classList.add("issues-author-container")

			const authorIcon = authorContainer.createEl("img");
			authorIcon.classList.add("issues-author-icon")
			authorIcon.src = comment?.avatar_url;

			const authorName = authorContainer.createEl("span", { text: comment?.login });
			authorName.classList.add("issues-author-name")

			const commentBody = commentsContainer.createDiv();
			commentBody.classList.add("issues-comment-body")

			const commentText = commentBody.createEl("span");
			MarkdownRenderer.renderMarkdown(comment?.body, commentText, "", Component.prototype);
			commentText.classList.add("issues-comment-text")
			commentText.classList.add("selectable-text");

		});

		const commentsInput = contentEl.createEl("textarea");
		commentsInput.classList.add("issues-comments-input")
		//set the label
		const commentsInputLabel = contentEl.createEl("label", { text: "Write a comment" });
		commentsInputLabel.classList.add("issues-comments-input-label")
		commentsInputLabel.htmlFor = commentsInput.id;


		const buttonsContainer = contentEl.createDiv();
		buttonsContainer.classList.add("issues-buttons-container")

		const commentButton = buttonsContainer.createEl("button", { text: "Comment" });
		commentButton.classList.add("issues-comment-button")

		const closeButton = buttonsContainer.createEl("button", { text: "Close Issue" });
		closeButton.classList.add("issues-close-button")

		commentButton.onclick = async () => {
			const updated = await api_comment_on_issue(this.octokit, this.issue, commentsInput.value);
			if (updated) {
				new Notice("Comment posted");
				this.close();
			}
		}

		closeButton.onclick = async () => {
			const updated = await api_update_issue(this.octokit, this.issue, {
				state: "closed"
			});

			if (updated) {
				reRenderView(this.app);
				this.close();
				new Notice("Issue closed");
			} else {
				new Notice("Could not close issue");
			}
		}

	}

	private showButtonOnInputChange(input: HTMLTextAreaElement, button: HTMLButtonElement, initialValue: string) {
		input.addEventListener("input", () => {
			if (input.value !== initialValue) {
				button.classList.add("visible");
			} else {
				button.classList.remove("visible");
			}
		});
	}
}
