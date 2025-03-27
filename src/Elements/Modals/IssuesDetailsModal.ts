import { App, Component, MarkdownRenderer, Modal, Notice } from "obsidian";
import { ClassLabels, Issue, allProperLabels } from "../../Issues/Issue";
import { Octokit } from "@octokit/core";
import { getPasteableTimeDelta, reRenderView } from "../../Utils/Utils";
import { loadingSpinner } from "../../Utils/Loader";
import {
	Assignee,
	api_comment_on_issue,
	api_get_issue_comments,
	api_get_issue_details,
	api_update_issue,
	api_set_labels_on_issue,
	api_add_assignees_to_issue,
	api_remove_assignees_from_issue,
	Label
} from "../../API/ApiHandler";
import { getTextColor } from "../../Utils/Color.utils";
import { IssueViewParams } from "src/main";
import { MyTaskStatus } from "../../Tasks/Tasks";

function orderedAssignees(assignees: Assignee[], logins: string[]): Assignee[] {
	if (logins.length == 0) {
		return assignees;
	} else {
		return assignees.sort((a1, a2) => {
			if (logins.contains(a1.login)) return -1;
			if (logins.contains(a2.login)) return 1;
			return 0;
		});
	}
}

/**
 * Modal for seeing the issue details
 */
export class IssuesDetailsModal extends Modal {
	issue: Issue;
	octokit: Octokit;
	repo_class_labels: ClassLabels;
	task_states: MyTaskStatus[];

	constructor(app: App, issue: Issue, task_states: MyTaskStatus[], repo_class_labels: ClassLabels, octokit: Octokit) {
		super(app);
		this.issue = issue;
		this.repo_class_labels = repo_class_labels;
		this.octokit = octokit;
		this.task_states = task_states;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.classList.add("issue-details");

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

		this.showButtonIfChanged(titleInput, saveTitleButton, details.title);

		const createdContainer = contentEl.createDiv();
		// Create a single line container with space-between
		const createdLineContainer = createdContainer.createSpan();
		createdLineContainer.classList.add("issue-details-info-line");
		// Left group for author info
		const authorGroup = createdLineContainer.createSpan();
		authorGroup.classList.add("issue-details-author-group");
		if (details.is_pull_request) {
			const prPill = authorGroup.createSpan({ text: "PR" });
			prPill.classList.add("issue-details-pr-pill");
			prPill.style.backgroundColor = "rgba(205, 57, 23, 0.5)";
			authorGroup.createSpan({text: `Created by ${this.issue.author} ${getPasteableTimeDelta(this.issue.created_at)}`});
		} else {
			const authorIcon = authorGroup.createEl("img");
			authorIcon.classList.add("issue-details-fold-button")
			authorIcon.src = details?.avatar_url;
			authorGroup.createSpan({text: `Opened by ${this.issue.author} ${getPasteableTimeDelta(this.issue.created_at)}`});
		}
		// Right-aligned issue link
		const issueLink = createdLineContainer.createEl("a", { text: this.issue.view_params?.repo + ` #` + this.issue.number });
		issueLink.setAttribute("href", "https://github.com/" + this.issue.view_params?.owner + "/" + this.issue.view_params?.repo + "/issues/" + this.issue.number);

		const assigneeContainer = contentEl.createDiv();
		// Create a single line container with space-between
		const assigneeLineContainer = assigneeContainer.createSpan();
		assigneeLineContainer.classList.add("issue-details-info-line");
		// Left group for author info
		const assigneeGroup = assigneeLineContainer.createSpan();
		assigneeGroup.classList.add("issue-details-author-group");
		const assigneeIcon = assigneeGroup.createEl("img");
		assigneeIcon.classList.add("issue-details-fold-button");
		let assignee_text = "";
		let assignees_in_sync= false;
		const ordered_assignees = orderedAssignees(details.assignees, this.issue.assignees);
		if ((details.assignees.length) && (this.issue.assignees.length)) {
			// both sides have at least one assignee
			const logins = details.assignees.map(a => a.login).join("+");
			if (this.issue.assignees.contains("*")) {
				assignee_text = `Assigned to ${logins}`;
				assigneeIcon.src = details.assignees[0].avatar_url;
				assigneeContainer.classList.remove('issue-findings');
				assignees_in_sync = true;
			} else if (this.issue.assignees.contains(details.assignees[0].login)) {
				assignee_text = `Assigned to ${logins}`;
				assigneeIcon.src = details.assignees[0].avatar_url;
				assigneeContainer.classList.remove('issue-findings');
				assignees_in_sync = true;
			} else if (details.assignees.map(a => a.login).contains(this.issue.assignees[0])) {
				assignee_text = `Assigned to ${logins}`;
				assigneeIcon.src = details.assignees[0].avatar_url;
				assigneeContainer.classList.remove('issue-findings');
				assignees_in_sync = true;
			} else {
				assignee_text = `Assigned to ${logins}}`;
				assigneeIcon.src = details.assignees[0].avatar_url;
				assigneeContainer.classList.add('issue-findings');
			}
		} else if ((this.issue.assignees.length) && (this.issue.assignees.contains("*"))) {
			assignee_text = `Unassigned, assignable to ${this.issue.assignees.join("+")}`;
			assigneeContainer.classList.remove('issue-findings');
		} else if (this.issue.assignees.length) {
			assignee_text = `Unassigned, assign to ${this.issue.assignees[0]}`;
			assigneeContainer.classList.add('issue-findings');
		} else if (details.assignees.length) {
			assignee_text = `Unassign ${details.assignees.map(a => a.login).join("+")}`;
			assigneeContainer.classList.add('issue-findings');
		} else {
			assignee_text = 'Unassigned';
			assigneeContainer.classList.remove('issue-findings');
			assignees_in_sync = true;
		}
		assigneeGroup.createSpan({ text: assignee_text });
		// Right-aligned fold button
		const foldAssigneesButton = assigneeLineContainer.createEl("button", { text: ">" });
		foldAssigneesButton.classList.add("issue-labels-fold-button");

		const assigneeGrid = contentEl.createDiv();
		assigneeGrid.classList.add("issue-details-labels-grid");

		const allAssignees = this.task_states.map( ts => ts.name.split(" ")[0]).sort((t1,t2) => {
            if (t1 > t2) return 1;
            if (t1 < t2) return -1;
            return 0;
        });
		details.assignees.forEach((a) => {
			if (!allAssignees.contains(a.login)) {
				allAssignees.push(a.login);
			}
		});

		if (allAssignees.length > 0) {
			const originalAssignees = new Set(details.assignees.map(a => a.login));
			const proposedAssignees = new Set(this.issue.assignees.filter(a => a != "*"));
			const checkboxes: HTMLInputElement[] = [];
			this.appendAssigneeCheckboxes(assigneeGrid, proposedAssignees, allAssignees, checkboxes);
			const saveAssigneesButton = contentEl.createEl("button", { text: "Save Assignees" });
			saveAssigneesButton.classList.add("issue-details-save-button");

			const checkForChanges = () => {
				const currentAssignees = new Set(
					checkboxes
						.filter(cb => cb.checked)
						.map(cb => cb.value)
				);

				const hasChanges =
					originalAssignees.size !== currentAssignees.size ||
					![...originalAssignees].every(ass => currentAssignees.has(ass));

				if (hasChanges) {
					saveAssigneesButton.classList.add("visible");
				} else {
					saveAssigneesButton.classList.remove("visible");
				}
			};			

			checkboxes.forEach(checkbox => {
				checkbox.addEventListener("change", checkForChanges);
			});

			foldAssigneesButton.onclick = async () => {
				if (foldAssigneesButton.textContent == ">") {
					foldAssigneesButton.textContent = "v";
					assigneeGrid.style.display = "block"
				} else {
					foldAssigneesButton.textContent = ">";
					assigneeGrid.style.display = "none"
				}
			}

			assigneeGrid.style.display = "none";

			saveAssigneesButton.onclick = async () => {
				const selectedAssignees = Array.from(assigneeGrid.querySelectorAll("input:checked")).map((checkbox: HTMLInputElement) => checkbox.value);
				const newAssignees = new Set([...selectedAssignees].filter(x => !originalAssignees.has(x)));
				const removedAssignees = new Set([...originalAssignees].filter(x => !selectedAssignees.contains(x)));
				let added: boolean | undefined = true;
				let removed: boolean | undefined = true;
				if (newAssignees.size) {
					added = await api_add_assignees_to_issue(
									this.octokit, this.issue.view_params, 
									this.issue, [...newAssignees]);
					if (added) {
						const text = `${[...newAssignees].join("/")} assigned`;
						new Notice(text);
						console.log(text);
					} else {
						const text = `${[...newAssignees].join("/")} could not be assigned`;
						new Notice(text);
						console.log(text);
					}
				}

				if (removedAssignees.size) {
					removed = await api_remove_assignees_from_issue(
									this.octokit, this.issue.view_params, 
									this.issue, [...removedAssignees]);
					if (removed) {
						const text = `${[...removedAssignees].join("/")} de-assigned`;
						new Notice(text);
						console.log(text);
					} else {
						const text = `${[...removedAssignees].join("/")} could not be de-assigned`;
						new Notice(text);
						console.log(text);
					}
				}

				if (added) {
					this.issue.assignees = selectedAssignees;
					if (removed) {
						saveAssigneesButton.classList.remove("visible");
					}
				}				
			}
		}

		const stateAndLabelsContainer = contentEl.createDiv();
		stateAndLabelsContainer.classList.add("issue-details-label-pill");
		// Create a single line container for state and labels pills
		const statePill = stateAndLabelsContainer.createDiv();
		statePill.classList.add("issue-details-label-pill")
		if (details?.state === "open") {
			statePill.style.backgroundColor = "rgba(31, 118, 41, 0.5)";
		} else {
			statePill.style.backgroundColor = "rgba(116, 58, 222, 0.5)";
		}
		const state = statePill.createEl("span", { text: details?.state });
		state.classList.add("issue-details-label-name");

		const labels = stateAndLabelsContainer.createDiv();
		labels.classList.add("issue-details-labels")

		const mapped_labels = details.labels.map((label: any) => {
			return {
				name: label.name,
				color: label.color
			} as Label;
		})
		const tl = new ClassLabels(mapped_labels, this.issue.view_params, this.issue.number, "" + this.issue.description);

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

		const foldLabelsButton = stateAndLabelsContainer.createEl("button", { text: ">" });
		foldLabelsButton.classList.add("issue-labels-fold-button");

		const labelsGrid = contentEl.createDiv();
		labelsGrid.classList.add("issue-details-labels-grid");

		if (this.issue.view_params != null) {
			const allLabels = this.repo_class_labels;
			const originalSelections = new Set(details.labels.map(label => label.name));
			const newLabels = new Set(allProperLabels(this.issue.cls).map((l) => l.name));
			const checkboxes: HTMLInputElement[] = [];

			this.appendLabelCheckboxes(labelsGrid, newLabels, allLabels.feature_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, newLabels, allLabels.priority_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, newLabels, allLabels.other_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, newLabels, allLabels.foreign_labels, checkboxes);
			this.appendLabelCheckboxes(labelsGrid, newLabels, allLabels.product_labels, checkboxes);

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


			foldLabelsButton.onclick = async () => {
				if (foldLabelsButton.textContent == ">") {
					foldLabelsButton.textContent = "v";
					labelsGrid.style.display = "block"
				} else {
					foldLabelsButton.textContent = ">";
					labelsGrid.style.display = "none"
				}
			}

			labelsGrid.style.display = "none";

			saveLabelsButton.onclick = async () => {
				const labels = [...allLabels.feature_labels,
				...allLabels.priority_labels,
				...allLabels.other_labels,
				...allLabels.foreign_labels,
				...allLabels.product_labels];
				const selectedLabels = Array.from(labelsGrid.querySelectorAll("input:checked")).map((checkbox: HTMLInputElement) => checkbox.value);
				const updated = await api_set_labels_on_issue(this.octokit, this.issue.view_params, this.issue, selectedLabels);
				if (updated) {
					new Notice("Labels updated");
					this.issue.cls = new ClassLabels(
						selectedLabels.map(label => { return { name: label, color: labels.find(l => l.name == label)?.color } as Label; })
						, this.issue.view_params
						, this.issue.number, "" + this.issue.description);
					saveLabelsButton.classList.remove("visible");
				} else {
					new Notice("Could not update labels");
				}
			};
		}

		const descriptionContainer = contentEl.createDiv();
		descriptionContainer.classList.add("issue-details-description-container");

		const descriptionHeader = descriptionContainer.createEl("span", { text: "Description:" });

		const descriptionPreview = descriptionContainer.createDiv();
		descriptionPreview.classList.add("issue-details-description-preview");

		let new_description = this.issue.description;
		if ((details.body) && (!new_description.contains(details.body))) {
			new_description = new_description + "\n" + details.body;
		}

		// Initial markdown render
		await MarkdownRenderer.render(
			this.app,
			new_description,
			descriptionPreview,
			'',
			new Component()
		);

		const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
		};

		const descriptionInput = descriptionContainer.createEl("textarea", { text: new_description });
		descriptionInput.classList.add("issue-details-description-input");
		descriptionInput.style.display = "none";

		// Initial size adjustment
		autoResizeTextarea(descriptionInput);

		// Resize on input
		descriptionInput.addEventListener("input", () => {
			autoResizeTextarea(descriptionInput);
		});

		// Switch to edit mode on preview click
		descriptionPreview.addEventListener("click", () => {
			descriptionPreview.style.display = "none";
			descriptionInput.style.display = "block";
			descriptionInput.focus();
			autoResizeTextarea(descriptionInput);
		});

		// Switch back to preview on blur
		descriptionInput.addEventListener("blur", async () => {
			descriptionPreview.empty();
			await MarkdownRenderer.render(
				this.app,
				descriptionInput.value ?? "",
				descriptionPreview,
				'',
				new Component()
			);
			descriptionInput.style.display = "none";
			descriptionPreview.style.display = "block";
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

			const commentsBody = commentsContainer.createDiv();
			commentsBody.classList.add("issue-details-comments-body")

			const commentsText = commentsBody.createEl("span");
			MarkdownRenderer.render(
				this.app,
				comment?.body,
				commentsText,
				'',
				new Component()
			);
			commentsText.classList.add("issue-details-comments-text")
			commentsText.classList.add("selectable-text");

		});

		const commentContainer = contentEl.createDiv();
		commentContainer.classList.add("issue-details-comment-container")

		const commentHeader = commentContainer.createEl("span", { text: "Write a comment:" });

		const commentInput = commentContainer.createEl("textarea");
		commentInput.classList.add("issue-details-comment-input")
		if (this.issue.findings.length > 0) {
			commentInput.setText(this.issue.findings.join("\n"));
			commentInput.classList.add("issue-findings")
		};

		autoResizeTextarea(commentInput);

		// Resize on input
		commentInput.addEventListener("input", () => {
			autoResizeTextarea(commentInput);
		});

		const buttonsContainer = contentEl.createDiv();
		buttonsContainer.classList.add("issue-details-buttons-container")

		const commentButton = buttonsContainer.createEl("button", { text: "Comment" });
		commentButton.classList.add("issue-details-comment-button")

		const closeButton = buttonsContainer.createEl("button", { text: "Close Issue" });
		closeButton.classList.add("issue-details-close-button")

		this.showButtonOnInputChange(commentInput, commentButton, "");

		commentButton.onclick = async () => {
			const updated = await api_comment_on_issue(this.octokit, this.issue.view_params, this.issue, commentInput.value);
			if (updated) {
				new Notice("Issue comment posted");
				commentButton.classList.remove("visible");
			} else {
				new Notice("Could not post comment");
			}
		}

		this.showButtonIfChanged(commentInput, commentButton, "");

		closeButton.onclick = async () => {
			const updated = await api_update_issue(this.octokit, this.issue, {
				state: "closed"
			});

			if (updated) {
				this.close();
				new Notice("Issue closed");
			} else {
				new Notice("Could not close issue");
			}
		}

	}

	private normalizeText(text: string | null | undefined): string {
		if (!text) return '';
		return text
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			.trim();
	}

	private showButtonIfChanged(input: HTMLTextAreaElement, button: HTMLButtonElement, initialValue: string): boolean {
		const normalizedInput = this.normalizeText(input.value);
		const normalizedInitial = this.normalizeText(initialValue);
		if (!normalizedInput && !normalizedInitial) {
			button.classList.remove("visible");
			return false;
		}
		const hasChanged = normalizedInput !== normalizedInitial;
		button.classList.toggle("visible", hasChanged);
		return hasChanged;
	}

	private showButtonOnInputChange(input: HTMLTextAreaElement, button: HTMLButtonElement, initialValue: string) {
		input.addEventListener("input", () => {
			this.showButtonIfChanged(input, button, initialValue);
		});
	}

	private appendAssigneeCheckboxes(
		assigneeGrid: HTMLElement,
		proposedAssignees: Set<String>,
		allAssignees: string[],
		checkboxes: HTMLElement[]
	) {
		for (let i = 0; i < Math.floor((allAssignees.length + 1) / 2); i++) {
			const row = assigneeGrid.createDiv();
			row.classList.add(i === 0 ? "issue-details-labels-row-first" : "issue-details-labels-row");

			// First label
			this.createAssigneeElement(row, allAssignees[i], proposedAssignees, checkboxes);

			// Second label (if exists)
			const secondIndex = i + Math.floor((allAssignees.length + 1) / 2);
			if (secondIndex < allAssignees.length) {
				this.createAssigneeElement(row, allAssignees[secondIndex], proposedAssignees, checkboxes);
			}
		}
	}

	private appendLabelCheckboxes(
		labelsGrid: HTMLElement,
		originalSelections: Set<String>,
		labels: Label[],
		checkboxes: HTMLElement[]
	) {
		for (let i = 0; i < Math.floor((labels.length + 1) / 2); i++) {
			const row = labelsGrid.createDiv();
			row.classList.add(i === 0 ? "issue-details-labels-row-first" : "issue-details-labels-row");

			// First label
			this.createLabelElement(row, labels[i], originalSelections, checkboxes);

			// Second label (if exists)
			const secondIndex = i + Math.floor((labels.length + 1) / 2);
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

	private createAssigneeElement(
		container: HTMLElement,
		assignee: string,
		proposedAssignees: Set<String>,
		checkboxes: HTMLElement[]
	): void {
		const assigneeContainer = container.createDiv();
		assigneeContainer.classList.add("issue-details-label-grid-container");

		const assigneeCheckbox = assigneeContainer.createEl("input", {
			type: "checkbox",
			value: assignee,
			attr: { id: `assignee-${assignee}` }
		});
		assigneeCheckbox.checked = proposedAssignees.has(assignee);
		checkboxes.push(assigneeCheckbox);

		const assigneeText = assigneeContainer.createEl("span", {
			text: assignee,
			attr: { for: `assignee-${assignee}` }
		});
	}

}

