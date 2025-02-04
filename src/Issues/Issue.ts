import { Label, RepoItem} from "../API/ApiHandler";
import { IssueViewParams} from "../main";

export enum IssueSortOrder {
	feature = "Feature, Title, Labels, Id",
	title = "Title, Feature, Labels, Id",
	idDesc = "Id desc",
	idAsc = "Id asc"
  }

/**
 * TaskLabels class
 */
export class TaskLabels {
	feature_labels: Label[];
	normal_labels: Label[];
	platform_labels: Label[];
	id_labels: Label[];

	constructor(mapped_labels: Label[], view_params: IssueViewParams, id?: number) {
		const rts: string[] = view_params.repo_tokens;
		const ots: string[] = view_params.other_tokens;
		this.feature_labels = [];
		this.normal_labels = [];
		this.platform_labels = [];
		this.id_labels = [];

		const sorted_labels = mapped_labels.sort((l1,l2) => {
			if (l1.name > l2.name) {
				return 1;
			}
			if (l1.name < l2.name) {
				return -1;
			}
			return 0;
		});
		if (id !== undefined) {
			sorted_labels.push({ name: "#"+id, color: "ffffff" } as Label);
		} 

		sorted_labels.forEach((label) => {
			if (rts.some( token => token == label.name )) {
				this.platform_labels.push(label);
			}
			else if (ots.some( token => token == label.name )) {
				this.platform_labels.push(label);
			}
			else if (label.name.search(/#/) == 0) {
				if (isNaN(+label.name.substring(1))) {
					this.feature_labels.push(label);
				}
				else {
					this.id_labels.push(label);
				}
			}
			else {
				this.normal_labels.push(label)
			}
		})

	}
}

/**
 * Issue class
 */
export class Issue {
	number: number;
	title: string;
	description: string;
	author: string | undefined;
	created_at: string;
	task_labels: TaskLabels;
    view_params: IssueViewParams;
	sort_string: string = "";

	constructor(t: string, d: string, a: string, n: number, created_at: string, task_labels: TaskLabels, view_params: IssueViewParams) {
		this.title = t;
		this.description = d;
		this.author = a;
		this.number = n;
		this.created_at = created_at;
        this.view_params = view_params;
		this.task_labels = task_labels;
	}
}

/**
 * Issue class for CSV
 */
export class CSVIssue extends Issue {
    constructor(csv: string, view_params: IssueViewParams){
		const split = csv.split(',');
        const issue_number: number = parseInt(split[0]);
        const issue_title: string = split[1];
        const issue_author: string = split[2];
        const issue_created_at: string = split[3];
		const mapped_labels = split[4].split(';').map((label: string) => {
			return {
				name: label.split('#')[0],
				color: label.split('#')[1]
			} as Label
		});
		const tl = new TaskLabels(mapped_labels, view_params);
        super(issue_title, "", issue_author, issue_number, issue_created_at, tl, view_params);
    }
}

/*
 * Constructs a string which can be used to sort issues by features then issue title then platforms
 */
export function getIssueSortKey(title: string, tl: TaskLabels, sort_order: IssueSortOrder ): string {
	const res: string[] = [];
	switch  (sort_order) {
		case IssueSortOrder.feature: {
			tl.feature_labels.forEach((label) => {
					res.push(label.name);
			});
			res.push(title);
			tl.platform_labels.forEach((label) => {
				res.push(label.name);
			});
			tl.id_labels.forEach((label) => {
				res.push(label.name);
			});
			break;
		};
		case IssueSortOrder.title: {
			res.push(title);
			tl.feature_labels.forEach((label) => {
				res.push(label.name);
			});
			tl.platform_labels.forEach((label) => {
				res.push(label.name);
			});
			tl.id_labels.forEach((label) => {
				res.push(label.name);
			});
			break;
		};
		case IssueSortOrder.idAsc: {
			tl.id_labels.forEach((label) => {
				res.push(label.name);
			});
			break;
		};
		case IssueSortOrder.idDesc: {
			tl.id_labels.forEach((label) => {
				res.push(label.name);
			});
		};
	}
	return res.join();
}

export function sortIssues(issues: Issue[], sort_order: IssueSortOrder) {
	issues.forEach((issue) => {
		issue.sort_string = getIssueSortKey(issue.title, issue.task_labels, sort_order);
	});

	issues = issues.sort((i1, i2) => {
		if (i1.sort_string > i2.sort_string) {
			return 1;
		}
		if (i1.sort_string < i2.sort_string) {
			return -1;
		}
		return 0;
	});
}