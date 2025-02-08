import { Issue, allProperLabels } from "../Issues/Issue";
import { getPasteableTimeDelta } from "../Utils/Utils";
import { IssuesDetailsModal } from "./Modals/IssuesDetailsModal";
import { App } from "obsidian";
import { Octokit } from "@octokit/core";
import { getTextColor } from "../Utils/Color.utils";
import { api_get_issue_details, Label } from "src/API/ApiHandler";

export class IssueItems {
	private static lastHighlightedIssue: HTMLElement | null = null;

	/*
	 * Creates a default issue element
	 * @param el - the element to append the issue to
	 * @param issue - the issue to append
	 * @param reponame - the name of the repo the issue is in
	 */
	public static createDefaultIssueElement(
		el: HTMLElement,
		issue: Issue,
		ocotokit: Octokit,
		app: App,
	) {
		const container = el.createDiv({ cls: "issue-items-container" });

		const title = container.createEl("h6", { text: issue.title });
		title.classList.add("issue-items-title");

		const details = container.createDiv();
		const detailsContainer = details.createDiv();
		 detailsContainer.classList.add("issue-items-details-container");

		const creatorText = detailsContainer.createEl("span", {
			text: `#${issue.number} opened ${getPasteableTimeDelta(issue.created_at)} by ${issue.author}`
		});
		creatorText.classList.add("issue-items-creator-text");

		if (issue.assignee) {
			const assigneeText = detailsContainer.createEl("span", {
				text: `assigned to ${issue.assignee}`
			});
			assigneeText.classList.add("issue-items-assignee-text");
		}

		const labelContainer = title.createDiv({ cls: "issue-items-label-container" });

		allProperLabels(issue.cls).forEach((label) => {
			const labelEl = labelContainer.createDiv({ cls: "issue-items-label" });
			labelEl.style.backgroundColor = `#${label.color}`;
			labelEl.style.color = getTextColor(label.color);
			labelEl.innerText = label.name;
			labelEl.classList.add("issue-items-label");
		});

		container.addEventListener("mouseenter", () => {
			container.style.opacity = "0.7";
		});

		container.addEventListener("mouseleave", () => {
			container.style.opacity = "1";
		});

		container.addEventListener("click", () => {
			this.openIssueDetailsModal(app, container, el, issue, ocotokit, 'default');
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

	private static openIssueDetailsModal(app: App, container: HTMLDivElement, parent: HTMLElement, issue: Issue, ocotokit: Octokit, type: 'default' | 'compact') {
		container.style.opacity = "0.5";
		this.highlightIssue(container);
		const modal = new IssuesDetailsModal(app, issue, ocotokit);
		modal.onClose = async () => {
			await IssueItems.reloadIssue(container, parent, issue, ocotokit, app, type);
		};
		modal.open();
	}

	private static async reloadIssue(container: HTMLElement, parent: HTMLElement, issue: Issue, ocotokit: Octokit, app: App, type: 'default' | 'compact') {
		const updatedIssueDetail = await api_get_issue_details(ocotokit, issue);
		if (updatedIssueDetail) {
			issue.title = updatedIssueDetail.title;
			issue.description = updatedIssueDetail.body;
			// labels are updated on the issue object directly as the changes are not reflected in the issue object (from server) immediately
			if (type === 'compact') {
				const textSpan = container.querySelector('span');
				if (textSpan) {
					textSpan.textContent = `#${issue.number} • ${issue.title}`;
				}
			} else {
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


export function createBadTaskAlert(
	el: HTMLElement,
	bt: string) 
{
	const container = el.createDiv({ cls: "issue-items-container" });
	const title = container.createEl("h6", { text: bt });
	title.classList.add("issue-items-title");
}
