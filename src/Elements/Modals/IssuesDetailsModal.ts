import { App, Component, MarkdownRenderer, Modal, Notice } from "obsidian";
import { ClassLabels, Issue, allProperLabels} from "../../Issues/Issue";
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
import { getTextColor } from "../../Utils/Color.utils";

/**
 * Modal for seeing the issue details
 */
export class IssuesDetailsModal extends Modal {
	issue: Issue;
	octokit: Octokit;
	repo_class_labels: ClassLabels;

	constructor(app: App, issue: Issue, repo_class_labels: ClassLabels, octokit: Octokit) {
		super(app);
		this.issue = issue;
		this.repo_class_labels = repo_class_labels;
		this.octokit = octokit;
	}

	async onOpen() {
		const { contentEl } = this;

		const titleInput = contentEl.createEl("textarea", { text: this.issue.title });
		titleInput.classList.add("issue-details-title-input");

		const saveTitleButton = contentEl.createEl("button", { text: "Save Title" });
		saveTitleButton.classList.add("issue-details-save-button");

		//fetch the issue details
		const spinner = loadingSpinner();
		contentEl.appendChild(spinner);
		const details = await api_get_issue_details(this.octokit, this.issue);
		spinner.remove();
		if (!details) {
			contentEl.createEl("h3", { text: "Could not fetch issue details" });
			return;
		}

		this.showButtonOnInputChange(titleInput, saveTitleButton, details.title);

		saveTitleButton.onclick = async () => {
			const updated = await api_update_issue(this.octokit, this.issue, {
				title: titleInput.value
			});
			if (updated) {
				new Notice("Issue Title updated");
				saveTitleButton.classList.remove("visible");
			} else {
				new Notice("Could not update issue");
			}
		}

		const createdContainer = contentEl.createDiv();
		createdContainer.classList.add("issue-details-created-container");

		const authorAndCreateDate = createdContainer.createSpan();
		//author icon
		const authorIcon = authorAndCreateDate.createEl("img");
		authorIcon.classList.add("issue-details-assignee-icon")
		authorIcon.src = details?.avatar_url;
		//author login
		const author = authorAndCreateDate.createSpan({
			text: `Created by ${this.issue.author} ${getPasteableTimeDelta(this.issue.created_at)}`
		});

		const issueLink = createdContainer.createEl("a", { text: this.issue.view_params?.repo + ` #` + this.issue.number });
		issueLink.setAttribute("href", "https://github.com/" + this.issue.view_params?.owner + "/" + this.issue.view_params?.repo + "/issues/" + this.issue.number);
		issueLink.classList.add("issue-details-link")

		const assignedContainer = contentEl.createDiv();
		// asignee login / icon
		const assigneeIcon = assignedContainer.createEl("img");
		assigneeIcon.classList.add("issue-details-assignee-icon");
		let assignee_text = "";
		if (details.assignee.login != undefined) {
			if (details.assignee.login == this.issue.assignee) {
				assignee_text = `Assigned to ${details.assignee.login}`;
				assigneeIcon.src = details?.assignee.avatar_url;
				assignedContainer.classList.remove('issue-findings');
			} else if (this.issue.assignee = "") {
				assignee_text = `Unassign ${details.assignee.login}`;
				assignedContainer.classList.add('issue-findings');
			}
		} else if (this.issue.assignee.length > 0) {
			assignee_text = `Re-assign to ${this.issue.assignee}`;
			assignedContainer.classList.add('issue-findings');
		} else {
			assignee_text = 'not assigned';
			assignedContainer.classList.remove('issue-findings');
		}
		const assignee = assignedContainer.createSpan({ text: assignee_text	});

		const stateAndLabelsContainer = contentEl.createDiv();
		stateAndLabelsContainer.classList.add("issue-details-state-and-label-container")

		const statePill = stateAndLabelsContainer.createDiv();
		statePill.classList.add("issue-details-state-pill")
		//make it green if state is open
		if (details?.state === "open") {
			statePill.style.backgroundColor = "rgba(31, 118, 41, 0.5)";
		} else {
			statePill.style.backgroundColor = "rgba(116, 58, 222, 0.5)";
		}

		const state = statePill.createEl("span", { text: details?.state });
		state.classList.add("issue-details-state")

		const labels = stateAndLabelsContainer.createDiv();
		labels.classList.add("issue-details-labels")

		const mapped_labels = details.labels.map((label: any) => {
			return {
				name: label.name,
				color: label.color
			} as Label;
		})
		const tl = new ClassLabels(mapped_labels, this.issue.view_params);
		
		//loop through the labels
		// eslint-disable-next-line no-unsafe-optional-chaining
		for (const label of allProperLabels(tl)) {
			const labelPill = labels.createDiv();
			labelPill.classList.add("issue-details-label-pill")
			labelPill.style.background = "#" + label.color;
			const labelName = labelPill.createEl("span", { text: label.name });
			labelName.classList.add("issue-details-label-name")
			labelName.style.color = getTextColor(label.color);
		}

		const labelsGrid = contentEl.createDiv();
		labelsGrid.classList.add("issue-details-labels-grid");

		if (this.issue.view_params != null) {
			const allLabels = this.repo_class_labels; // await api_get_labels(this.octokit, this.issue.view_params);
			const originalSelections = new Set(details.labels.map(label => label.name));
			const checkboxes: HTMLInputElement[] = [];

			this.appendLabelCheckboxes(labelsGrid, originalSelections, allLabels.feature_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, originalSelections, allLabels.priority_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, originalSelections, allLabels.other_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, originalSelections, allLabels.foreign_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, originalSelections, allLabels.product_labels, checkboxes);

			const saveLabelsButton = contentEl.createEl("button", { text: "Save Labels" });
			saveLabelsButton.classList.add("issue-details-save-button");

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
				const labels = [...allLabels.feature_labels, 
								...allLabels.priority_labels,
								...allLabels.other_labels,
								...allLabels.foreign_labels,
								...allLabels.product_labels];
				const selectedLabels = Array.from(labelsGrid.querySelectorAll("input:checked")).map((checkbox: HTMLInputElement) => checkbox.value);
				const updated = await api_set_labels_on_issue(this.octokit, this.issue, selectedLabels);
				if (updated) {
					new Notice("Labels updated");
					this.issue.cls = new ClassLabels(
						selectedLabels.map(label => { return { name: label, color: labels.find(l => l.name == label)?.color } as Label; })
						, this.issue.view_params
						, this.issue.number);
					saveLabelsButton.classList.remove("visible");
					// this.close();
				} else {
					new Notice("Could not update labels");
				}
			};
		}

		const descriptionContainer = contentEl.createDiv();
		descriptionContainer.classList.add("issue-details-description-container");

		const headerContainer = descriptionContainer.createDiv();
		headerContainer.classList.add("issue-details-author-container")

		const descriptionHeader = headerContainer.createEl("span", { text: "Description:" });
		descriptionHeader.classList.add("issue-details-author-name")

		const previewDiv = descriptionContainer.createDiv();
		previewDiv.classList.add("issue-details-description-preview");

		// Initial markdown render
		await MarkdownRenderer.render(
			this.app,
			details.body,
			previewDiv,
			'',
			new Component()
		);

		const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
		};

		const descriptionInput = contentEl.createEl("textarea", { text: details.body });
		descriptionInput.classList.add("issue-details-description-input");
		descriptionInput.style.display = "none";

		// Initial size adjustment
		autoResizeTextarea(descriptionInput);

		// Resize on input
		descriptionInput.addEventListener("input", () => {
			autoResizeTextarea(descriptionInput);
		});

		// Switch to edit mode on preview click
		previewDiv.addEventListener("click", () => {
			previewDiv.style.display = "none";
			descriptionInput.style.display = "block";
			descriptionInput.focus();
			autoResizeTextarea(descriptionInput);
		});

		// Switch to edit mode on preview click
		previewDiv.addEventListener("click", () => {
			previewDiv.style.display = "none";
			descriptionInput.style.display = "block";
			descriptionInput.focus();
		});

		// Switch back to preview on blur
		descriptionInput.addEventListener("blur", async () => {
			previewDiv.empty();
			await MarkdownRenderer.render(
				this.app,
				descriptionInput.value,
				previewDiv,
				'',
				new Component()
			);
			descriptionInput.style.display = "none";
			previewDiv.style.display = "block";
		});

		const saveDescriptionButton = contentEl.createEl("button", { text: "Save Description" });
		saveDescriptionButton.classList.add("issue-details-save-button");

		this.showButtonOnInputChange(descriptionInput, saveDescriptionButton, details.body);

		saveDescriptionButton.onclick = async () => {
			const updated = await api_update_issue(this.octokit, this.issue, {
				body: descriptionInput.value
			});
			if (updated) {
				new Notice("Issue Description updated");
				saveDescriptionButton.classList.remove("visible");
				// this.close
			} else {
				new Notice("Could not update issue");
			}
		}

		//load the comments
		const spinner2 = loadingSpinner();
		contentEl.appendChild(spinner2);
		const comments = await api_get_issue_comments(this.octokit, this.issue);
		spinner2.remove();
		if (!comments) {
			contentEl.createEl("h5", { text: "Could not fetch comments" });
			return;
		}

		comments.forEach(comment => {
			const commentsContainer = contentEl.createDiv();
			commentsContainer.classList.add("issue-details-comments-container")

			const authorContainer = commentsContainer.createDiv();
			authorContainer.classList.add("issue-details-author-container")

			const authorIcon = authorContainer.createEl("img");
			authorIcon.classList.add("issue-details-author-icon")
			authorIcon.src = comment?.avatar_url;

			let header_text = comment?.login + " commented " + getPasteableTimeDelta(comment?.update_at);
			const authorName = authorContainer.createEl("span", { text: header_text });
			authorName.classList.add("issue-details-author-name")

			const commentBody = commentsContainer.createDiv();
			commentBody.classList.add("issue-details-comment-body")

			const commentText = commentBody.createEl("span");
			MarkdownRenderer.render(
				this.app,
				comment?.body,
				commentText,
				'',
				new Component()
			);
			commentText.classList.add("issue-details-comment-text")
			commentText.classList.add("selectable-text");

		});

		const commentsInput = contentEl.createEl("textarea");
		commentsInput.classList.add("issue-details-comments-input")
		if (this.issue.findings.length > 0) {
			commentsInput.setText(this.issue.findings.join("\n"));
			commentsInput.classList.add("issue-findings")
		};
		
		//set the label
		const commentsInputLabel = contentEl.createEl("label", { text: "Write a comment" });
		commentsInputLabel.classList.add("issue-details-comments-input-label")
		commentsInputLabel.htmlFor = commentsInput.id;


		const buttonsContainer = contentEl.createDiv();
		buttonsContainer.classList.add("issue-details-buttons-container")

		const commentButton = buttonsContainer.createEl("button", { text: "Comment" });
		commentButton.classList.add("issue-details-comment-button")

		const closeButton = buttonsContainer.createEl("button", { text: "Close Issue" });
		closeButton.classList.add("issue-details-close-button")

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

	private appendLabelCheckboxes(
		labelsGrid: HTMLElement,
		originalSelections: Set<String>,
		labels: Label[],
		checkboxes: HTMLElement[]
	) {
		for (let i = 0; i < Math.floor((labels.length+1) / 2); i++) {
			const row = labelsGrid.createDiv();
			row.classList.add(i === 0 ? "issue-details-labels-row-first" : "issue-details-labels-row");

			// First label
			this.createLabelElement(row, labels[i], originalSelections, checkboxes);

			// Second label (if exists)
			const secondIndex = i + Math.floor((labels.length+1) / 2);
			if (secondIndex < labels.length) {
				this.createLabelElement(row, labels[secondIndex], originalSelections, checkboxes);
			}

		}
	}

	private createLabelElement(
		container: HTMLElement,
		label: Label,
		originalSelections: Set<String>,
		checkboxes: HTMLElement[]
	): void {
		const labelContainer = container.createDiv();
		labelContainer.classList.add("issue-details-label-grid-container");

		const labelCheckbox = labelContainer.createEl("input", {
			type: "checkbox",
			value: label.name,
			attr: { id: `label-${label.name}` }
		});
		labelCheckbox.checked = originalSelections.has(label.name);
		checkboxes.push(labelCheckbox);

		const labelPill = labelContainer.createEl("label", {
			text: label.name,
			attr: { for: `label-${label.name}` }
		});
		labelPill.classList.add("issue-details-label-pill");
		labelPill.style.background = `#${label.color}`;
		labelPill.style.color = getTextColor(label.color);
	}

}

