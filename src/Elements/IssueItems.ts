import { Issue, allProperLabels, ClassLabels } from "../Issues/Issue";
import { getPasteableTimeDelta } from "../Utils/Utils";
import { IssuesDetailsModal } from "./Modals/IssuesDetailsModal";
import { App } from "obsidian";
import { Octokit } from "@octokit/core";
import { getTextColor } from "../Utils/Color.utils";
import { api_get_issue_details, Label } from "src/API/ApiHandler";
import { IssueViewParams } from "src/main";

export class IssueItems {

	static view_params: IssueViewParams;

	private static lastHighlightedIssue: HTMLElement | null = null;

	/*
	 * Creates a default issue element
	 * @param el - the element to append the issue to
	 * @param issue - the issue to append
	 * @param reponame - the name of the repo the issue is in
	 */
	public static createDefaultIssueElement( el: HTMLElement, issue: Issue,
					repo_class_labels: ClassLabels, ocotokit: Octokit, app: App ) {

		const container = el.createDiv({ cls: "issue-items-container" });

		if (issue.findings.length > 0) {
			container.classList.add('issue-findings');
		};

		const title = container.createEl("h6", { text: issue.title });
		title.classList.add("issue-items-title");

		const detailsContainer = container.createDiv();
		detailsContainer.classList.add("issue-items-details-container");
		// Create a single line container with space-between
		const detailsLineContainer = detailsContainer.createSpan();
		detailsLineContainer.classList.add("issue-details-info-line");
		// Left group for author info
		const authorGroup = detailsLineContainer.createSpan();
		authorGroup.classList.add("issue-details-author-group");
		if (issue.is_pull_request) {
			const prPill = authorGroup.createSpan({ text: "PR" });
			prPill.classList.add("issue-details-pr-pill");
			prPill.style.backgroundColor = "rgba(205, 57, 23, 0.5)";
			authorGroup.createSpan({text: `#${issue.number} created ${getPasteableTimeDelta(issue.created_at)} by ${issue.author}`});
		} else {
			let tid = "";
			if (issue.cls.tid_labels.length > 0) {
				tid = " " + issue.cls.tid_labels[0].name;
			};
			authorGroup.createSpan({text: `#${issue.number}${tid} opened ${getPasteableTimeDelta(issue.created_at)} by ${issue.author}`});
		}
		// Right-aligned issue link
		let assignee_text = 'unassigned';
		if (issue.assignees.length > 0) {
			assignee_text = `assigned to ${issue.assignees.join("+")}`;
		};
		const assigneeText = detailsLineContainer.createEl("span", {text: assignee_text});

		const labelContainer = title.createDiv({ cls: "issue-items-label-container" });

		allProperLabels(issue.cls).forEach((label) => {
			const labelEl = labelContainer.createDiv({ cls: "issue-items-label" });
			labelEl.style.backgroundColor = `#${label.color}`;
			labelEl.style.color = getTextColor(label.color);
			labelEl.innerText = label.name;
		});

		container.addEventListener("mouseenter", () => {
			container.style.opacity = "0.7";
		});

		container.addEventListener("mouseleave", () => {
			container.style.opacity = "1";
		});

		container.addEventListener("click", () => {
			this.openIssueDetailsModal(app, container, el, issue, repo_class_labels, ocotokit);
		});
	}

	private static highlightIssue(container: HTMLElement) {
		if (IssueItems.lastHighlightedIssue) {
			IssueItems.lastHighlightedIssue.classList.remove('issue-highlighted');
			IssueItems.lastHighlightedIssue.style.opacity = "1";
		}
		container.classList.add('issue-highlighted');
		container.style.opacity = "0.8";
		IssueItems.lastHighlightedIssue = container;
	}

	private static openIssueDetailsModal(app: App, container: HTMLDivElement, parent: HTMLElement, 
					issue: Issue, repo_class_labels: ClassLabels, ocotokit: Octokit) {
		container.style.opacity = "0.5";
		this.highlightIssue(container);
		const modal = new IssuesDetailsModal(app, issue, IssueItems.view_params, repo_class_labels, ocotokit);
		modal.onClose = async () => {
			await IssueItems.reloadIssue(container, parent, issue, ocotokit, app);
		};
		modal.open();
	}

	private static async reloadIssue(container: HTMLElement, parent: HTMLElement, 
							issue: Issue, ocotokit: Octokit, app: App) {
		const updatedIssueDetail = await api_get_issue_details(ocotokit, IssueItems.view_params, issue);
		if (updatedIssueDetail) {
			if (updatedIssueDetail.state == "closed") {
				console.log("removing #" + issue.number + " visibility in issue list");
				container.empty();
			} else {
				issue.title = updatedIssueDetail.title;
				issue.description = updatedIssueDetail.body;
				// labels are updated on the issue object directly as the changes are not reflected in the issue object (from server) immediately
				const titleEl = container.querySelector('.issue-items-title');
				if (titleEl) {
					titleEl.textContent = issue.title;
					const labelContainer = titleEl.createDiv({ cls: "issue-items-label-container" });
					allProperLabels(issue.cls).forEach((label) => {
						const labelEl = labelContainer.createDiv({ cls: "issue-items-label" });
						labelEl.style.backgroundColor = `#${label.color}`;
						labelEl.style.color = getTextColor(label.color);
						labelEl.innerText = label.name;
						labelEl.classList.add("issue-items-label");
					});
				}
			}
		}
	}
}


export function createBadTaskAlert( el: HTMLElement, bt: string) {
	const container = el.createDiv({ cls: "issue-items-container" });
	container.classList.add("issue-findings");
	const title = container.createEl("h6", { text: bt });
	title.classList.add("issue-items-title");
}

export function setViewParameters(view_params: IssueViewParams) {
	IssueItems.view_params = view_params;
}
