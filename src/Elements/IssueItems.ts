import { Issue } from "../Issues/Issue";
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
		const container = el.createDiv({ cls: "issue-container" });

		const title = container.createEl("h6", { text: issue.title });
		title.classList.add("issue-title");

		const details = container.createDiv({ cls: "issue-details" });
		details.classList.add("issue-details");
		const detailsText = details.createEl("span", {
			text: `#${issue.number} opened ${getPasteableTimeDelta(
				issue.created_at,
			)} by ${issue.author}`,
		});
		detailsText.classList.add("issue-details-text");
		const labelContainer = title.createDiv({ cls: "label-container" });
		const all_labels: Label[] = issue.task_labels.feature_labels.concat(issue.task_labels.normal_labels).concat(issue.task_labels.platform_labels);
		all_labels.forEach((label) => {
			const labelEl = labelContainer.createDiv({ cls: "label" });
			labelEl.style.backgroundColor = `#${label.color}`;
			labelEl.style.color = getTextColor(label.color);
			labelEl.innerText = label.name;
			labelEl.classList.add("labelEl");
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

	public static createCompactIssueElement(
		el: HTMLElement,
		issue: Issue,
		ocotokit: Octokit,
		app: App,
	) {
		const container = el.createDiv({ cls: "issue-container" });
		container.classList.add("compact");

		const text = container.createSpan({
			text: `#${issue.number} • ${issue.title} `,
		});
		text.classList.add("compact");

		const text2 = container.createSpan({
			text: `Opened ${getPasteableTimeDelta(issue.created_at)} by ${issue.author
				}`,
		});

		text2.style.opacity = "0.7";

		container.addEventListener("mouseenter", () => {
			container.style.opacity = "0.7";
		});

		container.addEventListener("mouseleave", () => {
			container.style.opacity = "1";
		});

		container.addEventListener("click", () => {
			this.openIssueDetailsModal(app, container, el, issue, ocotokit, 'compact');
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
				const titleEl = container.querySelector('.issue-title');
				if (titleEl) {
					titleEl.textContent = issue.title;
					const labelContainer = titleEl.createDiv({ cls: "label-container" });
					const all_labels = issue.task_labels.feature_labels
						.concat(issue.task_labels.normal_labels)
						.concat(issue.task_labels.platform_labels);

					all_labels.forEach((label) => {
						const labelEl = labelContainer.createDiv({ cls: "label" });
						labelEl.style.backgroundColor = `#${label.color}`;
						labelEl.style.color = getTextColor(label.color);
						labelEl.innerText = label.name;
						labelEl.classList.add("labelEl");
					});
				}
			}
		}
	}
}
