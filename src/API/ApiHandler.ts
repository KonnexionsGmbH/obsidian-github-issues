import { Octokit } from "@octokit/core";
import { ClassLabels, Issue } from "../Issues/Issue";
import { parseRepoUrl } from "../Utils/Utils";
import { OctokitResponse } from "@octokit/types";
import { Notice } from "obsidian";
import { IssueViewParams } from "../main";


/**
 * Checks if the github api is reachable with the given token
 * @param token
 * @param base_url
 */
export async function api_authenticate(token: string, base_url: string): Promise<Octokit | null> {
	const octokit = new Octokit({
		auth: token,
		baseUrl: base_url
	});

	const res: OctokitResponse<never> = await octokit.request("GET /octocat", {});
	// console.log(res)
	if (res.status === 200) {
		return octokit;
	} else {
		return null;
	}
}

/**
 * Creates new labels on GitHub
 * @param octokit
 * @param view_params
 * @param label_name
 */
export async function api_create_new_label(octokit: Octokit, view_params: IssueViewParams, label_name: string) {
	if (view_params == null) return false;
	const res = await octokit.request('POST /repos/{owner}/{repo}/labels', {
	owner: view_params.owner,
	repo: view_params.repo,
	name: label_name,
	description: 'Feature Label',	// change this in GitHub if desired
	color: 'aaaaaa',				// change this in GitHub if desired
	headers: {
	  'X-GitHub-Api-Version': '2022-11-28'
	}
  })
  return res.status == 201;
}


/**
 * Returns all the labels of a repo as an object of classified labels
 * @param octokit
 * @param view_params
 */
export async function api_get_labels(octokit: Octokit, view_params: IssueViewParams): Promise<ClassLabels> {

	const res = await octokit.request('GET /repos/{owner}/{repo}/labels', {
		owner: view_params.owner,
		repo: view_params.repo,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status == 200) {
		const mapped_labels = res.data.map((label: any) => {
			return {
				name: label.name,
				color: label.color
			} as Label;
		});
		return new ClassLabels(mapped_labels, view_params);
	} else {
		return new ClassLabels([],view_params)
	}
}

/**
 * Submit an issue to a repo
 * @param octokit
 * @param view_params
 * @param issue
 * @returns true if the issue was submitted successfully
 */
export async function api_submit_issue(octokit: Octokit, view_params: IssueViewParams, issue: SubmittableIssue): Promise<Issue[]> {

	const res = await octokit.request('POST /repos/{owner}/{repo}/issues', {
		owner: view_params.owner,
		repo: view_params.repo,
		title: issue.title,
		body: issue.description,
		assignees: issue.assignees, 
		labels: issue.labels,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	console.log("api_submit_issue result: ", res);
	
	if (res.status == 201) {

			const mapped_labels = res.data.labels.map((label: any) => {
			return {
				name: label.name,
				color: label.color
				} as Label;
			})
			const description = res.data.body ?? "";
			const tl = new ClassLabels(mapped_labels, view_params, res.data.number, "");
			return [new Issue(
				res.data.title,
				description,
				res.data.user?.login ?? "",
				res.data.number,
				res.data.created_at,
				res.data.assignees?.map(a => a.login) ?? [],
				tl,
				false
			)];
	} else {
		return [];
	}
}

/**
 * Returns all open issues of a repo as an array of Issue objects
 * @param octokit
 * @param repo
 * @param view_params
 */
export async function api_get_own_issues(octokit: Octokit, view_params: IssueViewParams): Promise<Issue[]> {
	const issues: Issue[] = [];
	console.debug("api_get_own_issues");
	const res = await octokit.request('GET /repos/{owner}/{repo}/issues', {
		owner: view_params.owner,
		repo: view_params.repo,
		per_page: 100,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status == 200) {
		for (const issue of res.data) {
			const mapped_labels = issue.labels.map((label: any) => {
			return {
				name: label.name,
				color: label.color
				} as Label;
			})
			const description = issue.body ?? "";
			const tl = new ClassLabels(mapped_labels, view_params, issue.number, description);
			if (tl.tid_labels.length > 1) {
				console.log("Multiple task labels detected for issue " + issue.number, tl);
			}
			let logins: string[] = [];
			if (issue.assignees) {
				logins = issue.assignees.map(a => a.login);
				logins.reverse();
			}
			issues.push(new Issue(
				issue.title,
				description,
				issue.user?.login ?? "",
				issue.number,
				issue.created_at,
				logins,
				tl,
				(issue.pull_request != undefined)
			));
		}

		return issues;
	} else {
		return [];
	}
}

/**
 * Returns one issue by Issue number (Issue ID), can fetch a closed issue too
 * @param octokit
 * @param repo
 * @param view_params
 * @param issue_num
 */
export async function api_get_issue_by_number(octokit: Octokit, view_params: IssueViewParams, issue_num: number) {

	if (view_params.repo == null) return;

	console.log(issue_num);
	const res = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue_num,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status == 200) {
		let ass: Assignee[] = [];
		if (res.data.assignees) {
			ass = res.data.assignees.map(a => { return {avatar_url: a.avatar_url, login: a.login} as Assignee })
		}
		return {
			title: res.data.title,
			body: res.data.body,
			labels: res.data.labels.map((label: any) => {
				return {
					name: label.name ?? "",
					color: label.color ?? ""
				}
			}),
			state: res.data.state,
			avatar_url: res.data.user?.avatar_url,
			updated_at: res.data.updated_at,
			assignees: ass,
			comments: res.data.comments,
			is_pull_request: (res.data.pull_request != undefined)
		} as RepoDetails;
	} else {
		return null;
	}
}

/**
 * Reloads one issue details from an already loaded issue object, could fetch a (meanwhile) closed issue too
 * @param octokit
 * @param issue
 */
export async function api_get_issue_details(octokit: Octokit, view_params: IssueViewParams, issue: Issue) {
	if (view_params.repo == null) return;

	const res = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue.number,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status == 200) {
		let ass: Assignee[] = [];
		if (res.data.assignees) {
			ass = res.data.assignees.map(a => { return {avatar_url: a.avatar_url, login: a.login} as Assignee })
		}
		return {
			title: res.data.title,
			body: res.data.body,
			labels: res.data.labels.map((label: any) => {
				return {
					name: label.name ?? "",
					color: label.color ?? ""
				}
			}),
			state: res.data.state,
			avatar_url: res.data.user?.avatar_url,
			updated_at: res.data.updated_at,
			assignees: ass,
			comments: res.data.comments,
			is_pull_request:  (res.data.pull_request != undefined)
		} as RepoDetails;
	} else {
		return null;
	}
}

/**
 * Saves a new comment for an already loaded issue object
 * @param octokit
 * @param issue
 * @param comment
 */
export async function api_comment_on_issue(octokit: Octokit, view_params: IssueViewParams, issue: Issue, comment: string) {
	if (view_params.repo == null) return;
	const res = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue.number,
		body: comment,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	return res.status == 201;
}

/**
 * Saves a new new set of labels for an already loaded issue object
 * @param octokit
 * @param issue
 * @param comment
 */
export async function api_set_labels_on_issue(octokit: Octokit, view_params: IssueViewParams, issue: Issue, labels: string[]) {
	if (view_params.repo == null) return;
	const res = await octokit.request('PUT /repos/{owner}/{repo}/issues/{issue_number}/labels', {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue.number,
		labels: labels,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	return res.status == 200;
}

/**
 * Adds assignees to an existing issue object
 * @param octokit 
 * @param view_params 
 * @param issue 
 * @param assignees 
 */
export async function api_add_assignees_to_issue(octokit: Octokit, view_params: IssueViewParams, issue: Issue, assignees:string[]) {
	if (view_params.repo == null) return;
	const res = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue.number,
		assignees: assignees,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	return res.status == 201;
}


/**
 * Remove assignees from an existing issue object
 * @param octokit 
 * @param view_params 
 * @param issue 
 * @param assignees 
 */
export async function api_remove_assignees_from_issue(octokit: Octokit, view_params: IssueViewParams, issue: Issue, assignees:string[]) {
	if (view_params.repo == null) return;
	const res = await octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue.number,
		assignees: assignees,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	return res.status == 200;
}

/**
 * Updates an issue
 * @param octokit
 * @param issue
 * @param toBeUpdated
 */
export async function api_update_issue(octokit: Octokit, view_params: IssueViewParams, issue: Issue, toBeUpdated: unknown) {
	if (view_params.repo == null) return;

	const options = {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue.number,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	}

	//append the toBeUpdated object to the options object
	Object.assign(options, toBeUpdated);

	const res = await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', options)
	return res.status == 200;
}

/**
 * Loads comments for an already loaded issue object
 * @param octokit
 * @param issue
 */
export async function api_get_issue_comments(octokit: Octokit, view_params: IssueViewParams, issue: Issue) {
	if (view_params.repo == null) return;
	const res = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
		owner: view_params.owner,
		repo: view_params.repo,
		issue_number: issue.number,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status == 200) {
		//return the comments array as RepoComment[]
		return res.data.map((comment) => {
			return {
				body: comment.body,
				login: comment.user?.login || "",
				avatar_url: comment.user?.avatar_url || "",
				created_at: comment.created_at,
				update_at: comment.updated_at,
				author_association: comment.author_association
			} as RepoComment;
		})
	} else {
		return [];
	}
}


export interface RepoComment {
	body: string;
	login: string;
	avatar_url: string;
	created_at: string;
	update_at: string;
	author_association: string;

}

export interface RepoItem {
	id: number;
	name: string;
	language: string;
	updated_at: string;
	owner: string;
}

export interface PullRequest {
	url: string;
}

export interface Assignee {
	avatar_url: string;
	login: string;
}

export interface RepoDetails {
	title: string;
	avatar_url: string,
	body: string;
	labels: Label[];
	state: string;
	updated_at: string;
	assignees: Assignee[];
	comments: number;
	is_pull_request: boolean; 
}

export interface Label {
	name: string;
	color: string;
}

export interface SubmittableIssue {
	title: string;
	description: string;
	labels: string[];
	assignees: string[];
}
