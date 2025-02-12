import { Editor } from "obsidian";
import { Label } from "../API/ApiHandler";
import { IssueViewParams} from "../main";

export enum IssueSortOrder {
	feature = "Feature, Title, ...",
	title = "Title, Feature, ...",
	idDesc = "Issue ID desc",
	idAsc = "Issue ID asc"
  }

/**
 * return a long id token from short or long one
*/
export function longName(name:string): string {
	let id:number = +name.substring(1);
	return "#"+ ("000000" + id).slice(-6);
}

function prioFromName(name: string): number {
    const names = [ 'p_backlog', 'p_low', 'p_high', 'p_highest', 'p_critical' ];
    return names.indexOf(name);
}

/**
 * ClassLabels class
 */
export class ClassLabels {
	feature_labels: Label[];
	product_labels: Label[];
	foreign_labels: Label[];
	priority_labels: Label[];
	other_labels: Label[];
	id_labels: Label[];

	constructor(mapped_labels: Label[], view_params: IssueViewParams, iid?: number) {
		const tid_token = "🆔";  // task id token
		const pts: string[] = view_params.product_tokens;
		const fts: string[] = view_params.foreign_tokens;
		this.feature_labels = [];
		this.product_labels = [];
		this.foreign_labels = [];
		this.priority_labels = [];
		this.other_labels = [];
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
		if (iid !== undefined) {
			sorted_labels.push({name: "#" + iid, color: "ffffff"} as Label);
		} 

		sorted_labels.forEach((label) => {
			if (pts.some( token => token == label.name )) {
				this.product_labels.push(label);
			}
			else if (fts.some( token => token == label.name )) {
				this.foreign_labels.push(label);
			}
			else if (label.name.search(/#/) == 0) {
				if (isNaN(+label.name.substring(1))) {
					this.feature_labels.push(label);
				}
				else {
					this.id_labels.push(label);
				}
			} else if ( label.name.startsWith("p_") ) {
				this.priority_labels.push(label)
			} else if (label.name == tid_token) {
				this.priority_labels.push(label);
			} else {
				this.other_labels.push(label)
			}
		});
		this.priority_labels.sort((l1, l2) => {
			if (prioFromName(l1.name) > prioFromName(l2.name)) {
				return -1;
			}
			if (prioFromName(l1.name) < prioFromName(l2.name)) {
				return 1;
			}
			return 0;
		});

	}
}

export function allProperLabels(cls: ClassLabels): Label[] {
	// notincluding id_labels
	return 	cls.feature_labels.concat(
			cls.priority_labels).concat(
			cls.other_labels).concat(
			cls.foreign_labels).concat(
			cls.product_labels);

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
	assignee: string;
	cls: ClassLabels;
    view_params: IssueViewParams;
	sort_string: string = "";
	findings: string[] = [];

	constructor(t: string, d: string, a: string, n: number, created_at: string, ass: string, cls: ClassLabels, view_params: IssueViewParams) {
		this.title = t;
		this.description = d;
		this.author = a;
		this.assignee = ass;
		this.number = n;
		this.created_at = created_at;
        this.view_params = view_params;
		this.cls = cls;
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
		const tl = new ClassLabels(mapped_labels, view_params);
        super(issue_title, "", issue_author, issue_number, issue_created_at, "", tl, view_params);
    }
}


/*
 * Constructs a string which can be used to sort issues by features then issue title then products
 */
export function issueSortKey(title: string, tl: ClassLabels, sort_order: IssueSortOrder ): string {
	const res: string[] = [];
	switch  (sort_order) {
		case IssueSortOrder.feature: {
			if (tl.feature_labels.length > 0) {
				res.push(tl.feature_labels[0].name);
			};
			res.push(title);
			tl.product_labels.forEach((label) => {
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
			tl.product_labels.forEach((label) => {
				res.push(label.name);
			});
			tl.id_labels.forEach((label) => {
				res.push(label.name);
			});
			break;
		};
		case IssueSortOrder.idAsc: {
			tl.id_labels.forEach((label) => {
				if (label.name.startsWith("#")) {
					res.push(longName(label.name));
				}
			});
			break;
		};
		case IssueSortOrder.idDesc: {
			tl.id_labels.forEach((label) => {
				if (label.name.startsWith("#")) {
					res.push(longName(label.name));
				}
			});
			break;
		};
	}
	return res.join();
}

export function sortIssues(issues: Issue[], sort_order: IssueSortOrder) {
	issues.forEach((issue) => {
		issue.sort_string = issueSortKey(issue.title, issue.cls, sort_order);
		// console.log("issue_sort_string: ", issue.sort_string);
	});

	if (sort_order == IssueSortOrder.idDesc) {
		issues.sort((i1, i2) => {
			if (i1.sort_string > i2.sort_string) {
				return -1;
			}
			if (i1.sort_string < i2.sort_string) {
				return 1;
			}
			return 0;
		});
	} else {
		issues.sort((i1, i2) => {
			if (i1.sort_string > i2.sort_string) {
				return 1;
			}
			if (i1.sort_string < i2.sort_string) {
				return -1;
			}
			return 0;
		});
	}
}
