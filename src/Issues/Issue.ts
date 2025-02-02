import {Label, RepoItem} from "../API/ApiHandler";

/**
 * TaskLabels class
 */
export class TaskLabels {
	feature_labels: Label[];
	normal_labels: Label[];
	platform_labels: Label[];
	id_labels: Label[];

	constructor(mapped_labels: Label[]) {
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

		sorted_labels.forEach((label) => {
			if (label.name == '#App') {
				this.platform_labels.push(label);
			}
			else if (label.name == '#Core') {
				this.platform_labels.push(label);
			}
			else if (label.name == '#Server') {
				this.platform_labels.push(label);
			}
			else if (label.name == '#User') {
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
	sort_string: string;
    repo: RepoItem | undefined;

	constructor(t: string, d: string, a: string, n: number, created_at: string, task_labels: TaskLabels, s: string, repo?: RepoItem) {
		this.title = t;
		this.description = d;
		this.author = a;
		this.number = n;
		this.created_at = created_at;
        this.repo = repo;
		this.task_labels = task_labels;
		this.sort_string = s;
	}
}

/**
 * Issue class for CSV
 */
export class CSVIssue extends Issue {
    constructor(csv: string, repo: RepoItem){
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
		const tl = new TaskLabels(mapped_labels);
        super(issue_title, "", issue_author, issue_number, issue_created_at, tl, getIssueSortKey(issue_title, tl), repo);
    }
}

/*
 * Constructs a string which can be used to sort issues by features then issue title then platforms
 */
export function getIssueSortKey(title: string, tl: TaskLabels): string {
	const res: string[] = [];

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

	return res.join();
}
