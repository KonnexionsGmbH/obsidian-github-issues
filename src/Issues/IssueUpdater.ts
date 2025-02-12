import { App, Editor, MarkdownView, Notice } from "obsidian";
import { api_get_issues_by_url } from "../API/ApiHandler";
import { verifyURL } from "../Utils/Utils";
import { pasteRepoName } from "./Issues.shared";
import { Octokit } from "@octokit/core";
import { CSVIssue } from "./Issue";
import { IssueViewParams } from "src/main";

/**
 * Fetches issues from the given url and updates them in the current editor
 * @param app
 */
export async function updateIssues(app: App) {

	//get the view parameters (owner and repo) from the current file
	const view_params = getViewParamsInFile(this.app);

	let view = app.workspace.getActiveViewOfType(MarkdownView)

	if (!checkEditor(view, view_params)) return;
	// I know that this is stupid, but it gets asserted in the checkEditor function so it's fine...probably
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	// repo = repo!;
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	view = view!;
	const editor = view.editor;
	const url = "https://github.com/" + view_params.owner + "/" + view_params.repo + ".git";

	//verify the url
	if (!verifyURL(url)) {
		new Notice("Error building url: " + url)
		return;
	}

	insertIssues(editor, view_params, view, url);
}

/**
 * Actually inserts the issues by replacing the lines between the start and end line of the repo and then pasting the issues
 * @param editor
 * @param repo
 * @param view
 * @param url
 * @private
 */
function insertIssues(editor: Editor, view_params: IssueViewParams, view: MarkdownView | null, url: string) {
	//delete the lines between the start and end line
	//editor.replaceRange("", { line: repo.start_line, ch: 0 }, { line: repo.end_line + 2, ch: 0 });

	// set the cursor to the start line
	//editor.setCursor({ line: repo.start_line, ch: 0 });

	//insert the issues
	const pasted = pasteRepoName(view, url);
	if (pasted) {
		new Notice("Updated issues");
	} else {
		new Notice("Some error occurred while pasting the issues")
	}
}

let lastUpdate: Date | null = null;

export async function softUpdateIssues(app: App, octokit: Octokit) {
	//check if the last update was more than 15 sec ago to prevent spamming the api
	if (lastUpdate && (new Date().getTime() - lastUpdate.getTime()) < 15000) {
		// new Notice("Update too soon")
		return;
	}

	// new Notice("Update triggered on " + new Date().toLocaleTimeString())

	//get the view parameters (owner and repo) from the current file
	const view_params = getViewParamsInFile(this.app);

	let view = app.workspace.getActiveViewOfType(MarkdownView);

	if (!checkEditor(view, view_params)) return;
	// I know that this is stupid, but it gets asserted in the checkEditor function so it's fine...probably
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	// repo = repo!;
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	// view = view!;
	const editor = view.editor;
	const url = "https://github.com/" + view_params.owner + "/" + view_params.repo + ".git";

	//verify the url
	if (!verifyURL(url)) {
		new Notice("Error building url: " + url)
		return;
	}

	//get the local issues by parsing the second line after the ```github-issues until the line with ```
	const local_issues: CSVIssue[] = [];
/*
	for (let i = repo.start_line + 2; i < repo.end_line; i++) {
		const line = editor.getLine(i);
		if (line === "```") {
			break;
		}
		local_issues.push(new CSVIssue(line, {} as IssueViewParams));
	}
*/
	// console.log("Local issues: " + local_issues.map(issue => issue.title).join(", "));

	const issues: CSVIssue[] = []; // await fetchIssues(octokit, url, view_params);

	// console.log("Remote issues: " + issues!.map(issue => issue.title).join(", "));

	//check if the issues are the same
	//if the issues are empty then stop
	let same = true;
	if (issues) {
		//if the issue lengths are different we know the issues are not the same
		if (issues.length == local_issues.length) {
			//loop trough the issues and check if the titles are the same
			for (let i = 0; i < issues.length; i++) {
				if (issues[i].title !== local_issues[i].title) {
					same = false;
					break;
				}
			}
		} else {
			same = false;
		}
		if (same) {
			new Notice("No Issue updates found")
			return;
		} else {
			insertIssues(editor, view_params, view, url);
		}
	}
	//update the last update time
	lastUpdate = new Date();
}


/**
 * Checks if the editor is in the correct mode and if a repo is found in the file
 * @param view
 * @param repo
 */
function checkEditor(view: MarkdownView | null, view_params: IssueViewParams | null) {
	if (!view) {
		new Notice("No active view");
		return false;
	}
	//get the current editor mode
	if (view.getMode() !== "source") {
		new Notice("Please switch to source mode before updating the issues");
		return false;
	}

	if (!view_params) {
		new Notice("No repo found in file");
		return false;
	}

	return true;
}

/**
 * Fetches issues from the given url
 * @param octokit
 * @param url
 */
async function fetchIssues(octokit: Octokit, url: string, view_params: IssueViewParams) {
	const issues = await api_get_issues_by_url(octokit, url, view_params);
	if (issues.length === 0) {
		return null;
	}
	return issues;
}

/**
 * Gets the repo name and repo from the current file
 * This is very hacky and should be replaced with a better solution
 * @param app
 */
export function getViewParamsInFile(app: App): IssueViewParams {
	//get the current editor
	let start_line = -1;
	let end_line = -1;
	let source = "";
	const view = app.workspace.getActiveViewOfType(MarkdownView)
	if (view) {
		const editor = view.editor;
		//loop trough the document and print every line
		for (let i = 0; i < editor.lineCount(); i++) {
			const line = editor.getLine(i);
			// console.log(line);
			if (line.includes("```github-issues")) {
				start_line = i;
				// console.log("start_line:", start_line);
			}
			else if (line.includes("```")) {
				end_line = i;
				// console.log("end_line:", end_line);
			}
			else if ((start_line > -1) || (end_line == -1)) {
				// console.log("line: ", line);
				source = source + line + "\n";
			}
		}
	}
	return new IssueViewParams(source.split("\n").filter((row) => row.length > 0));
}
