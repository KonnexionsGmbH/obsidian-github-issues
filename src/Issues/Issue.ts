import {Label, RepoItem} from "../API/ApiHandler";

/**
 * Issue class
 */
export class Issue {
	number: number;
	title: string;
	description: string;
	author: string | undefined;
	created_at: string;
	normal_labels: Label[] = [];
	feature_labels: Label[] = [];
	platform_labels: Label[] = [];
	sort_string: string;
    repo: RepoItem | undefined;

	constructor(t: string, d: string, a: string, n: number, created_at: string, nl: Label[], fl: Label[], pl: Label[], s: string, repo?: RepoItem) {
		this.title = t;
		this.description = d;
		this.author = a;
		this.number = n;
		this.created_at = created_at;
        this.repo = repo;
		this.normal_labels = nl;
		this.feature_labels = fl;
		this.platform_labels = pl;
		this.sort_string = s;
	}
}

/**
 * Issue class for CSV
 */
export class CSVIssue extends Issue {
    constructor(csv: string, repo: RepoItem){
        super("", "", "", 0, "", [], [], [], "", repo);
        const split = csv.split(',');
        this.number = parseInt(split[0]);
        this.title = split[1];
        this.author = split[2];
        this.created_at = split[3];
		this.normal_labels = split[4].split(';').map((label: string) => {
			return {
				name: label.split('#')[0],
				color: label.split('#')[1]
			} as Label
		});
		this.feature_labels = split[5].split(';').map((label: string) => {
			return {
				name: label.split('#')[0],
				color: label.split('#')[1]
			} as Label
		});
		this.platform_labels = split[6].split(';').map((label: string) => {
			return {
				name: label.split('#')[0],
				color: label.split('#')[1]
			} as Label
		});
		this.sort_string = getIssueSortKey(this.title, this.feature_labels, this.platform_labels);
    }
}
