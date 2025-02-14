import { Octokit } from "@octokit/core";
import { ClassLabels, Issue } from "../Issues/Issue";
import { parseRepoUrl } from "../Utils/Utils";
import { OctokitResponse } from "@octokit/types";
import { Notice } from "obsidian";
import { IssueViewParams } from "../main";


/**
 * Checks if the github api is reachable with the given token
 * @param token
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
 * Returns all the repos of a user specified by the username
 * @param octokit
 */
export async function api_get_repos(octokit: Octokit) {
	const res = await octokit.request('GET /user/repos', {
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})
	// console.log(res.data);
	//return an array of the repo names and ids
	return res.data.map((repo) => {
		return {
			id: repo.id,
			name: repo.name,
			language: repo.language,
			updated_at: repo.updated_at,
			owner: repo.owner.login
		} as RepoItem
	}
	);
}

/**
 * Creates new labels on GitHub
 * @param octokit
 * @param view_params
 */
export async function api_create_new_label(octokit: Octokit, view_params: IssueViewParams, name: string) {
	if (view_params == null) return false;
	const res = await octokit.request('POST /repos/{owner}/{repo}/labels', {
	owner: view_params.owner,
	repo: view_params.repo,
	name: name,
	description: 'Feature Label',
	color: 'aaaaaa',
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
			const tl = new ClassLabels(mapped_labels, view_params, res.data.number, description);
			// console.log("Assignee login: ", issue.assignee?.login);
			return [new Issue(
				res.data.title,
				description,
				res.data.user?.login ?? "",
				res.data.number,
				res.data.created_at,
				res.data.assignee?.login ?? "",
				tl,
				view_params
			)];
	} else {
		return [];
	}
}

/**
 * Returns all the issues of a repo as an array of Issue objects of a repo specified by the url
 * @param octokit
 * @param url
 */
export async function api_get_issues_by_url(octokit: Octokit, url: string, view_params: IssueViewParams ): Promise<Issue[]> {
	const { owner, repo } = parseRepoUrl(url);
	const issues: Issue[] = [];
	console.debug("api_get_issues_by_url");
	try {
		const res = await octokit.request('GET /repos/{owner}/{repo}/issues', {
			owner: owner,
			repo: repo,
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
				const tl = new ClassLabels(mapped_labels, view_params);
		
				issues.push(new Issue(
					issue.title,
					issue.body ?? "",
					issue.user?.login ?? "",
					issue.number,
					issue.created_at,
					issue.assignee?.login ?? "",
					tl,
					view_params
				));
			}

			return issues;
		} else {
			return [];
		}

	} catch (e) {
		new Notice("Error while fetching issues: " + e.message);
		return [];
	}


}

/**
 * Returns all the issues of a repo as an array of Issue objects
 * @param octokit
 * @param repo
 */
export async function api_get_own_issues(octokit: Octokit, view_params: IssueViewParams): Promise<Issue[]> {
	const issues: Issue[] = [];
	console.debug("api_get_own_issues");
	const res = await octokit.request('GET /repos/{owner}/{repo}/issues', {
		owner: view_params.owner,
		repo: view_params.repo,
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
			// console.log("Assignee login: ", issue.assignee?.login);
			issues.push(new Issue(
				issue.title,
				description,
				issue.user?.login ?? "",
				issue.number,
				issue.created_at,
				issue.assignee?.login ?? "",
				tl,
				view_params
			));
		}

		return issues;
	} else {
		return [];
	}
}

export async function api_get_issues_by_id(octokit: Octokit, view_params: IssueViewParams, issueIDs: number[]): Promise<Issue[]> {
	const iss = await api_get_own_issues(octokit, view_params);
	//filter the issues to only include the specified ones
	return iss.filter(issue => issueIDs.includes(issue.number));
}

export async function api_get_issue_details(octokit: Octokit, issue: Issue) {
	if (issue.view_params.repo == null) return;

	const res = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
		owner: issue.view_params.owner,
		repo: issue.view_params.repo,
		issue_number: issue.number,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status == 200) {
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
			assignee: {
				avatar_url: res.data.assignee?.avatar_url,
				login: res.data.assignee?.login
			} as Assignee,
			
			comments: res.data.comments
		} as RepoDetails;
	} else {
		return null;
	}
}

export async function api_comment_on_issue(octokit: Octokit, issue: Issue, comment: string) {
	if (issue.view_params.repo == null) return;
	const res = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
		owner: issue.view_params.owner,
		repo: issue.view_params.repo,
		issue_number: issue.number,
		body: comment,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	return res.status == 201;
}

export async function api_set_labels_on_issue(octokit: Octokit, issue: Issue, labels: string[]) {
	if (issue.view_params.repo == null) return;
	const res = await octokit.request('PUT /repos/{owner}/{repo}/issues/{issue_number}/labels', {
		owner: issue.view_params.owner,
		repo: issue.view_params.repo,
		issue_number: issue.number,
		labels: labels,
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
export async function api_update_issue(octokit: Octokit, issue: Issue, toBeUpdated: unknown) {
	if (issue.view_params.repo == null) return;

	const options = {
		owner: issue.view_params.owner,
		repo: issue.view_params.repo,
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

export async function api_get_issue_comments(octokit: Octokit, issue: Issue) {
	if (issue.view_params.repo == null) return;
	const res = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
		owner: issue.view_params.owner,
		repo: issue.view_params.repo,
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

export interface RepoDetails {
	title: string;
	avatar_url: string,
	body: string;
	labels: Label[];
	state: string;
	updated_at: string;
	assignee: Assignee;
	comments: number;
}

export interface Label {
	name: string;
	color: string;
}

export interface Assignee {
	avatar_url: string;
	login: string;

}

export interface SubmittableIssue {
	title: string;
	description: string;
	labels: string[];
	assignees: string[];
}
