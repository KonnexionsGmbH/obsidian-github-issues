import { Issue, prioFromName, issueNumber } from "../Issues/Issue";
import { Label, SubmittableIssue, api_submit_issue, api_get_issue_by_number } from "../API/ApiHandler";
import { Editor, Notice } from "obsidian";
import { IssueViewParams } from "../main";
import { Octokit } from "@octokit/core";

/**
 * ClassLabels class
 */
export class ClassTokens {

    feature_tokens: string[];
    product_tokens: string[];
    foreign_tokens: string[];
    priority_tokens: string[];
    other_tokens: string[];
    iid_tokens: string[];
    tid_tokens: string[];

    constructor(mapped_tokens: string[], view_params: IssueViewParams) {
        const prios = "⏬🔽🔼⏫🔺";	// prio0 .. prio4
        const tid_token = "🆔";		    // task ID

        const pts: string[] = view_params.product_tokens;
        const fts: string[] = view_params.foreign_tokens;
        this.feature_tokens = [];
        this.product_tokens = [];
        this.foreign_tokens = [];
        this.priority_tokens = [];
        this.other_tokens = [];    // dates, periodicity
        this.iid_tokens = [];
        this.tid_tokens = [];

        const sorted_tokens = mapped_tokens.sort((t1,t2) => {
            if (t1 > t2) {
                return 1;
            }
            if (t1 < t2) {
                return -1;
            }
            return 0;
        });

        sorted_tokens.filter(t => t.length > 0).forEach((token) => {
            if (pts.some( pts_token => token == pts_token )) {
                this.product_tokens.push(token);
            } else if (fts.some( fts_token => token == fts_token )) {
                this.foreign_tokens.push(token);
            } else if (token.startsWith(tid_token)) {
                this.tid_tokens.push(token);
            } else if ( prios.indexOf(token) > -1 ) {
                this.priority_tokens.push(token) 
            } else if (token.startsWith('#')) {
                if (isNaN(+token.substring(1))) {
                    this.feature_tokens.push(token);
                } else {
                    this.iid_tokens.push(token);
                }
            } else {
                this.other_tokens.push(token)
            }
        })
    }
}



/**
 * Task class
 */
export class Task {
    start: number;              // line number in 'ReleasesNote'
    end:   number;              // next line after Feature or ReleasesNote.length  
    title: string;              // text without tags
    description: string;        // optional markdown multi-line task description
    cts: ClassTokens;           // feature, product, id, priority, other (date/link) tags
    sort_string: string;
    status_code: string;        // " ": todo, "x":done, "s": assigned Sven, "S": working Sven, etc.

    constructor(start: number, end: number, t: string, d: string, cts: ClassTokens, sort: string, status: string) {
        this.start = start;
        this.end = end;
        this.title = t;
        this.description = d;
        this.cts = cts;
        this.sort_string = sort;
        this.status_code = status;
    }
}

/**
 * Feature class
 */
export class Feature {
    start: number;              // line number in ReleasesNote
    end:   number;              // next line after Feature or ReleasesNote.length 
    tag:   string;              // #F_FeatureName or #F_FeatureName/Subfeature or #Infra etc.
    hidden: boolean;
    tasks: Task[];              

    constructor(start: number, end: number, tag:string, hidden:boolean, tasks: Task[]) {
        this.start = start;
        this.end = end;
        this.tag = tag;
        this.hidden = hidden;
        this.tasks = tasks;
    }
}

// Task tokens, examples

// - [ ] #task One more task #Core #Server #102 🔺 🛫 2025-02-01 ✅ 2025-01-31
// - [ ] #task One more task #Core #Server #102 🔼 🛫 2025-02-01
// - [ ] #task One more task #Core #Server #102 🔽 🛫 2025-02-01
// - [ ] #task One more task #Core #Server ⏫
// - [ ] #task One more task #Core #Server #102 🔺 🔁 every day 🛫 2025-02-01 ❌ 2025-01-31
// - [ ] #task One more task #Core #Server #102 ⏬ 🛫 2025-02-01
// - [x] #task Description comes here 🆔 uo7126 ⛔ t3ls4p ⏫ ➕ 2025-02-03 ⏳ 2025-01-24 📅 2025-02-07


function prioTokenFromLabel(label: Label): string {
    const prios = "⏬🔽🔼⏫🔺";		// prio0 .. prio4
    const idx = prioFromName(label.name);
    switch  (idx) {
		case 0: { return "⏬"; break;};
		case 1: { return "🔽"; break;};
		case 2: { return "🔼"; break;};
		case 3: { return "⏫"; break;};
		case 4: { return "🔺"; break;};
        default: {return "🔺"; break;}
    }
}

function prioNameFromToken(token: string): string {
    const names = [ 'p_backlog', 'p_low', 'p_high', 'p_highest', 'p_critical' ];
    const tokens = "⏬🔽🔼⏫🔺";
    const idx = tokens.indexOf(token);
    if (idx > -1) {
        return names[idx];
    } else {
        return "p_not_found";
    }
}


/*
 * Constructs a string which can be used to sort tasks by feature, title, products, IssueId
 */
function taskSortKey(title: string, cts: ClassTokens ): string {
	const res: string[] = [];
		
    res.push(cts.feature_tokens[0]);
    res.push(title);
    cts.product_tokens.forEach((token) => {
        res.push(token);
    });
    cts.foreign_tokens.forEach((token) => {
        res.push(token);
    });
    cts.tid_tokens.forEach((token) => {
        res.push(token);
    });

    return res.join();
}

function pushTaskDescription(this_feature: string, this_task:string, tacc: Task[], line:string) {
    if (this_task.length > 0) {
        tacc[tacc.length-1].description = (tacc[tacc.length-1].description + "\n").concat(line);
    }
}


function cleanTaskDescription( d: string): string {
    // trims and removes task description empty lines at the end 
    const desc = d.split("\n").map(w => w.trim()).filter(line => line != "").join("\n");
    if (desc == "") {
        return ""
    } else {
        return "\n" + desc;
    }
}

function finishTask(this_feature: string, this_task: string, tacc: Task[], i: number): [string,string] {
    // may be called without open task(this_task == "")
    if (this_task.length > 0) {
        if (tacc[tacc.length - 1].end == 0) {
            tacc[tacc.length - 1].end = i;
        } else {
            console.log("Cannot re-finish in finishTask old and new end: ", tacc[tacc.length-1].end, i )
        }
    } else if (tacc.length > 0) {
        if (tacc[tacc.length - 1].end == 0) {
            console.log("this_task is empty in finishTask()")
        }
    };
    return [this_feature,""];
}

function startNewTask(this_feature: string, this_task: string, tacc: Task[], i: number, line: string, view_params: IssueViewParams): [string,string] {

    if (this_task.length > 0) {
        [this_feature, this_task] = finishTask(this_feature, this_task, tacc, i);
    }

    const task_tokens = "⏬🔽🔼⏫🔺➕⏳📅🛫✅❌🔁⛔🆔";
    
    const task_pos = line.indexOf("#task");
    const title_pos = task_pos + 6;
    const words: string[] = line.substring(title_pos).split(" ");

    let mapped_tokens: string[] = [];
    mapped_tokens.push(this_feature);
    
    let title_acc: string[] = [];
    let done = false;   // done with title and product/iid tokens, rest are other tokens
    let token_acc: string[] = [];
    words.filter(w => w.length > 0).forEach((word) => {
        if ( !done && ( task_tokens.indexOf(word) > -1 )) {
            done = true;
            token_acc = [word];
        } else if ( !done ) {
            // scanning for product or iid tokens or title pieces
            if (word.startsWith("#")) {
                mapped_tokens.push(word)
            } else if (word.length > 0) {
                title_acc.push(word);
            }
        } else if (done) {
            if ( task_tokens.indexOf(word) > -1 ) {
                mapped_tokens.push(token_acc.join(" "));
                token_acc = [word];
            } else if (word.length > 0) { 
                token_acc.push(word);
            }
        }
    })
    
    if (token_acc.length > 0) {
        mapped_tokens.push(token_acc.join(" "));
    };

    this_task = title_acc.join(" ");
    const cts = new ClassTokens(mapped_tokens, view_params);
       
    tacc.push(new Task(i, 0, this_task, "", cts, taskSortKey(this_task, cts), line.substring(task_pos - 3, task_pos - 2)));
    return [this_feature,this_task];
}

function finishFeature(this_feature: string, this_task: string, facc: Feature[], tacc: Task[], i: number): [string,string] {

    if (facc[facc.length-1].tag == this_feature) {
        facc[facc.length-1].end = i;
        if (this_task.length > 0) {
            [this_feature, this_task] = finishTask(this_feature, this_task, tacc, i);
        }
        facc[facc.length - 1].tasks = tacc;
        // console.log("Completed Feature: ", facc.length-1, facc[facc.length-1]);
        tacc = [];
    } else {
        console.log("Tag not matching in finishFeature()");
    }
    return ["",""];
}

function startNewFeature(this_feature: string, this_task: string, facc: Feature[], tacc: Task[], i: number, line: string): [string,string] {
    if (this_feature.length > 0) {
        [this_feature, this_task] = finishFeature(this_feature, this_task, facc, tacc, i);
    }
    const words = line.split(" ");
    this_feature = words[1];
    facc.push(new Feature(i, 0, this_feature, false, []));
    // console.log("New Feature: ", facc.length-1, facc[facc.length-1]);
    return [this_feature, ""];
}

export function parseTaskNote(editor: Editor, view_params: IssueViewParams, facc: Feature[]): Feature[] {
    let tacc: Task[] = [];
    let this_feature = "";
    let this_task = "";
    facc = [];
    console.log("EditorLineCount: ", editor.lineCount());
    for (let i = 0; i < editor.lineCount(); i++) {
        let line = editor.getLine(i);
        if (this_feature == "") { // look for a new feature
            if ((line.indexOf("#hidden") == -1) && (line.startsWith("### #"))) {
                [this_feature, this_task] = startNewFeature(this_feature, this_task, facc, tacc, i, line);
                tacc = [];
            }	// ignore tasks and arbitrary lines without task heading
        } else { // look for the end of the last feature
            if ((line.indexOf("#hidden") == -1) && (line.startsWith("### #"))) { // new feature
                [this_feature, this_task] = startNewFeature(this_feature, this_task, facc, tacc, i, line);
                tacc = [];
            } else if (line.startsWith("####")) {
                // skip headings of levels 4,5 and 6. May belong to features or tasks
                pushTaskDescription(this_feature, this_task, tacc, line);
            } else if (line.startsWith("#")) {
                [this_feature, this_task] = finishFeature(this_feature, this_task, facc, tacc, i);
            } else if ((line.indexOf("#task") > 3) && (line.contains("- ["))) {
                [this_feature, this_task] = startNewTask(this_feature, this_task, tacc, i, line, view_params); // but finish this_task first if needed
            } else {
                pushTaskDescription(this_feature, this_task, tacc, line);
            }
        }
    }
    if (this_feature.length > 0) {
        [this_feature, this_task] = finishFeature(this_feature, this_task, facc, tacc, editor.lineCount());
    }
    return facc;
}

export function sortAndPruneTasksNote(editor: Editor, facc: Feature[], view_params: IssueViewParams) {

    let line_shift = 0;
    for (let f = 0; f < facc.length; f++) {
        // sort tasks within this feature and remove empty lines
        let acc = "";
        let r_start = facc[f].end + line_shift;  // for features without tasks 
        if (facc[f].tasks.length > 0) {
            r_start = facc[f].tasks[0].start + line_shift; // tasks to be sorted start here
        };
        let r_end = facc[f].end + line_shift;     // replace text up to the end of the feature
        let idx = r_start;  // start index for next task
        facc[f].start = facc[f].start + line_shift;
        facc[f].tasks.sort((t1, t2) => {
            if (t1.sort_string > t2.sort_string) {
                return 1;
            }
            if (t1.sort_string < t2.sort_string) {
                return -1;
            }
            return 0;
        });
        for (let t = 0; t < facc[f].tasks.length; t++) {
            // loop through sorted tasks
            // trim descriptions and correct line numbers
            // accumulate replacement text
            facc[f].tasks[t].start = idx;
            let new_desc = cleanTaskDescription(facc[f].tasks[t].description);
            if (t == facc[f].tasks.length -1) {
                facc[f].tasks[t].description = new_desc;
            } else if (facc[f].tasks[t+1].title != facc[f].tasks[t].title) {
                facc[f].tasks[t].description = new_desc + "\n";
            };
            facc[f].tasks[t].end = idx + facc[f].tasks[t].description.split("\n").length;
            idx = facc[f].tasks[t].end;
            acc = acc + renderTask(facc[f].tasks[t], view_params) + facc[f].tasks[t].description + "\n";
        };
        facc[f].end = idx;
        line_shift = line_shift + idx - r_end; // correct feature.end and following features with this
        editor.replaceRange(acc, {line: r_start, ch: 0}, {line: r_end, ch: 0});
    }
}

export function collectBadTaskAlerts(facc: Feature[], view_params: IssueViewParams): [string[], Set<string>, Set<string>] {
    const bad_task_alerts: string[] = [];
    const set_ids = new Set<string>();     // issue ids for this repo over all features
    const set_titles = new Set<string>();   // title + " " + product strings for this repo over all features
    facc.forEach((feature) => {
        feature.tasks.forEach((task) => {
            const pts:string[] = [];    // product_tokens
            const fts:string[] = [];    // foreign_tokens
            if (task.title.split(/[⏬🔽🔼⏫🔺➕⏳📅🛫✅❌🔁⛔🆔]/).length > 1) {
                bad_task_alerts.push([feature.tag, "'", task.title, "'"].concat(["contains task token(s). Add spacing."]).join(" "));
            };
            task.cts.product_tokens.forEach((n) => {
                if (view_params.product_tokens.some( token => token == n )) {
                    pts.push(n);
                } else if (view_params.foreign_tokens.some( token => token == n )) {
                    fts.push(n);
                }
            });
            if ((pts.length > 0) && (fts.length > 0)) {
                bad_task_alerts.push([feature.tag, "/", task.title, "/"].concat(task.cts.iid_tokens).concat(["spans multiple repos"]).join(" "));
            }

            task.cts.product_tokens.forEach((token) => {
                const search = task.title + " " + token;
                if (set_titles.has(search)) {
                    bad_task_alerts.push([feature.tag, "/", task.title, "/"].concat(["conflicts with same title for " + token]).join(" "));
                } else {
                    set_titles.add(search);
                }                
            });

            task.cts.iid_tokens.forEach((iid) => {
                if (pts.length > 0) {
                    // only consider other iids for same repo
                    if (set_ids.has(iid)) {
                        bad_task_alerts.push([feature.tag, "/", task.title,"/"].concat(iid).concat(["conflicts with same issue id above"]).join(" "));
                    } else {
                        set_ids.add(iid);
                    }
                }
            });

            task.cts.tid_tokens.forEach((tid) => {
                if (set_ids.has(tid)) {
                    bad_task_alerts.push([feature.tag, "/", task.title,"/"].concat(tid).concat(["conflicts with same task id above"]).join(" "));
                } else {
                    set_ids.add(tid);
                }
            });
        })
    })

    return [bad_task_alerts, set_ids, set_titles] ;
}

export function generateUniqueId(existingIds: Set<string>) {
    const tid_token = "🆔";		    // task ID
    let id = '';
    let keepGenerating = true;

    while (keepGenerating) {

        // from https://www.codemzy.com/blog/random-unique-id-javascript
        id = tid_token + " " + Math.random().toString(36).substring(2, 6 + 2);

        if (!existingIds.has(id)) {
            keepGenerating = false;
        }
    }
    return id;
}


function renderTask(task: Task, view_params: IssueViewParams): string {
    const header = '- [' + task.status_code + '] ' + view_params.task_token;        
    const res = [header, task.title].concat(
            task.cts.product_tokens).concat(
            task.cts.foreign_tokens).concat(
            task.cts.iid_tokens).concat(     
            task.cts.tid_tokens).concat(     
            task.cts.priority_tokens).concat(
            task.cts.other_tokens).join(" ");
    // console.log("renderTask: ", res);
    return res;
}

function statusCodeFromAssignee( assignee: string ): string {
    // simple hack which supports 25 contributors but their GitHub login must start with different letters
    // need to peel out the user name from the task plugin configuration where the custom task states are named
    // console.log( "Assignee to be inserted: ", a);
    if (assignee != undefined) {
        if (assignee.length > 0){
            return assignee.slice(0,1).toLowerCase();
        } else {
            return " ";
        }
    } else {
        return " ";
    }
}

export function issueToForeignTaskSync(issue: Issue, view_params:IssueViewParams, editor: Editor, facc: Feature[], 
        set_ids: Set<string>, set_titles: Set<string>) {
    // search for foreign tasks with this title and product combination
    // if it does not exist, add the task without issue id.

    // to be implemented 
}



export function issueToTaskSync(issue: Issue, view_params:IssueViewParams, editor: Editor, facc: Feature[], 
        set_ids: Set<string>, set_titles: Set<string>) {
    
    const tid_token = "🆔";

    if (issue.cls.feature_labels.length > 1) {
        issue.findings.push('Issue cannot have more than one feature label');
    } else if (issue.cls.feature_labels.length == 0) {
        issue.findings.push('Issue can only be synced to Obsidian with a feature label');
    } else if (issue.cls.priority_labels.length > 1) {
        issue.findings.push('Issue cannot have more than one priority label');
    } else if (issue.cls.product_labels.length == 0) {
        issue.findings.push('Issue must have one or more product labels which are managed in this repo');
    } else if (issue.cls.iid_labels.length == 1) {

        let findings: string[] = [];
        
        // issue has one feature and at least one product label, maybe we can sync it with tasks
        const i_feature = issue.cls.feature_labels[0].name;  // issue has a feature label
        const i_id = issue.cls.iid_labels[0].name;           // issue id
        let t_id = "";
        if (issue.cls.tid_labels.length == 1) {
            t_id = issue.cls.tid_labels[0].name;       // task id
        }
        let t_task: Task;
        let t_found = false;
        let f_found = false;
        if ( set_ids.has(i_id) ) {   
            // task exists with i_id (and product), find it in facc and check title, feature, assignee and labels
            for (let f = 0; f < facc.length; f++) {
                if (facc[f].tag == i_feature) {
                    // feature exists in TasksNote
                    // search for task under correct feature only
                    f_found = true;
                    for (let t = 0; t < facc[f].tasks.length; t++) {
                        if (facc[f].tasks[t].cts.iid_tokens.some(token => token == i_id)) {
                            // task has the i_id token
                            t_task = facc[f].tasks[t];
                            t_found = true;
                            if ( !t_task.cts.tid_tokens.length && !issue.cls.tid_labels.length ) {
                                // ok, no task id linking possible
                            } else if ( t_task.cts.tid_tokens.length && !issue.cls.tid_labels.length ) {
                                issue.description = "synced to task " + t_task.cts.tid_tokens[0] + "\n" + issue.description;
                                findings.push("Proposing to add a task ID link to issue description.");
                            } else if ( !t_task.cts.tid_tokens.length && issue.cls.tid_labels.length ) {
                                if (set_ids.has(issue.cls.tid_labels[0].name)) {
                                    findings.push("Expected task ID exists on another task. We have an ID mismatch!");
                                } else {
                                    findings.push("Task has no task ID but a link exists in issue description. The ID may have been lost on the task and can be restored manually.");
                                };
                            } else if ( t_task.cts.tid_tokens[0] != issue.cls.tid_labels[0].name ){ 
                                findings.push('Task ID does not match the link in issue description.');
                            };

                            if (t_task.title != issue.title) {
                                findings.push('Task title does not match the issue title.');
                            };
                            if (t_task.status_code.toLowerCase().trim() != issue.assignee.charAt(0).toLowerCase()) {
                                findings.push(`Task status code [${t_task.status_code}] does not match issue assignee ${issue.assignee}.`);
                            };
                            if (t_task.cts.product_tokens.join() != issue.cls.product_labels.map(label => label.name).join()) {
                                findings.push("Task product tags don't match issue product labels.");
                            };
                            break;                    
                        }
                    }
                    if (!t_found) {
                        findings.push('Task feature does not match issue feature.');
                    } else {
                        break;
                    }
                }
            }
            if (!f_found) {
                issue.findings.push('The Issue has a feature label which is currently absent or hidden in tasks. Sync is paused for this issue.');
            }
            if (findings.length > 0) {
                new Notice(`Syncing issue ${i_id} to tasks had ${findings.length} findings.`);
                issue.findings = findings;
            }
        } else if (set_ids.has(t_id)) {
            console.log(t_id);
            // matching task Id exists but issue ID is not yet synced back
            for (let f = 0; f < facc.length; f++) {
                if (facc[f].tag == i_feature) {
                    // feature exists in TasksNote
                    // search for task under correct feature only
                    f_found = true;
                    for (let t = 0; t < facc[f].tasks.length; t++) {
                        if (facc[f].tasks[t].cts.tid_tokens.some(token => token == t_id)) {
                            // task has the t_id token
                            t_task = facc[f].tasks[t];
                            t_found = true;
                            if (t_task.title != issue.title) {
                                findings.push(`Task ${t_id} title does not match issue ${i_id} title.`);
                            } else {
                                // add the i_id token to the task
                                editor.setSelection({ line: t_task.start, ch: 0 }, { line: t_task.start+1, ch: 0 });
                                if (editor.getSelection().startsWith(renderTask(t_task,view_params))) {
                                    t_task.cts.iid_tokens.push(i_id);
                                    editor.replaceSelection(renderTask(t_task,view_params) + "\n");
                                    t_task.cts.iid_tokens.forEach((token) => {set_ids.add(token)});
                                    const message = [i_feature, i_id, `issue id updated in task ${t_id}` ].join(" ");
                                    new Notice(message);
                                    console.log(message);
                                } else {
                                    const message = [i_feature, i_id, `issue id could not be updated in task ${t_id}`].join(" ");
                                    new Notice(message);
                                    console.log(message);
                                }
                            };
                            if (t_task.status_code.toLowerCase().trim() != issue.assignee.charAt(0).toLowerCase()) {
                                findings.push(`Task status code [${t_task.status_code}] does not match issue assignee ${issue.assignee}.`);
                            };
                            if (t_task.cts.product_tokens.join() != issue.cls.product_labels.map(label => label.name).join()) {
                                findings.push("Task product tags don't match issue product labels.");
                            };
                            break;                    
                        }
                    }
                    if (!t_found) {
                        findings.push(`Task ${t_id} feature does not match issue ${i_id} feature (any more). Correct this manually!`);
                    } else {
                        break;
                    }
                }
            }
            if (!f_found) {
                issue.findings.push('The Issue has a feature label which is currently absent or hidden in tasks. Sync is paused for this issue.');
            }
            if (findings.length > 0) {
                new Notice(`Syncing issue ${i_id} to tasks had ${findings.length} findings.`);
                issue.findings = findings;
            }

        } else if (issue.cls.product_labels.filter(label => set_titles.has(issue.title + " " + label.name)).length > 0) {
            // a matching task without iid token exists. this should not happen often and can be fixed manually
            issue.findings.push('This issue cannot be linked automatically with its task. Find it by title and product and assign the id manually.');
            new Notice(`Syncing issue ${i_id} to tasks had one finding.`);

        } else {   
            // no task with this id exists, we assume that it was created on GitHub and
            // insert it into the ReleasesNote under its feature (if that exists there)
            let t_start = -1;     // editor line number where task is to be inserted
            for (let f = 0; f < facc.length; f++) {
                if ((t_start == -1) && (facc[f].tag == i_feature)) { 
                    // feature found and task not already inserted
                    t_start = facc[f].end; // new task goes to the end of the feature;
                    // Create task properties from the issue object. 
                    const status_code = statusCodeFromAssignee(issue.assignee);
                    const mapped_tokens: string[] = []; // 
                    issue.cls.feature_labels.map(label => label.name).forEach(token => mapped_tokens.push(token));
                    issue.cls.product_labels.map(label => label.name).forEach(token => mapped_tokens.push(token));
                    issue.cls.iid_labels.map(label => label.name).forEach(token => mapped_tokens.push(token));
                    issue.cls.priority_labels.forEach(label => mapped_tokens.push(prioTokenFromLabel(label)));

                    // console.log("Inserting Issue with these mapped_tokens: ", mapped_tokens);
                    
                    const cts = new ClassTokens(mapped_tokens, view_params); 
                    const sort_string = taskSortKey(issue.title, cts);
                    const new_task = new Task(t_start, t_start+1, issue.title, "", cts, sort_string, status_code);
                    const new_text = renderTask(new_task, view_params) + "\n";                    
                    editor.replaceRange(new_text, { line: t_start, ch: 0 }, { line: t_start, ch: 0 });
                    new Notice("Inserting new " + i_feature + " task from issue #" + issue.number );
                    // console.log("Inserting new " + i_feature + " task from issue #" + issue.number + " @" + t_start);
                    new_task.cts.tid_tokens.forEach((token) => {set_ids.add(token)});
                    new_task.cts.iid_tokens.forEach((token) => {set_ids.add(token)});
                    new_task.cts.product_tokens.forEach((token) => {set_titles.add(issue.title + " " + token)});
                    facc[f].tasks.push(new_task);
                    facc[f].end = facc[f].end + 1;

                    // console.log(i_feature + " starts at " + facc[f].start + " " + facc[f].end + " length " + facc[f].tasks.length);
                    
                } else if (t_start >= 0) {
                    // We inserted a task to the end of a previous feature and we need to correct
                    // the facc line number indexing so that we can use it for the next issue.
                    facc[f].start = facc[f].start + 1;
                    facc[f].end = facc[f].end + 1;
                    facc[f].tasks.forEach((task) => {
                        task.start = task.start + 1;
                        task.end = task.end + 1;
                    });
                }
            }            
        }
    }
}

export async function taskToIssueSync(task: Task, octokit: Octokit, view_params: IssueViewParams, 
        editor: Editor, issues: Issue[], iids: string[], bad_tasks_alerts: string[], 
        user: string, set_ids: Set<string>) {

    const status_obsolete = "xX-";

    const logins = ['c-bik','bojanbg','stoch','loydhook','walter-weinmann'];

    if (task.cts.iid_tokens.length == 1) {

        // link to issue may exist
        if (iids.indexOf(task.cts.iid_tokens[0]) >= 0) {
            // issue is open in repo, differences may already have been reported in issueToTaskSync
        } else if (status_obsolete.includes(task.status_code)) {
            // issue is closed or cancelled, ok 
        } else {
            const details = await api_get_issue_by_number(octokit, view_params, issueNumber(task.cts.iid_tokens[0]));
            if (details) {
                if (details.state == "closed") {
                    editor.setSelection({ line: task.start, ch: 0 }, { line: task.start+1, ch: 0 });
                    if (editor.getSelection().startsWith(renderTask(task,view_params))) {
                        task.status_code = "x";
                        editor.replaceSelection(renderTask(task,view_params) + "\n");
                        const message = [task.cts.feature_tokens[0], task.cts.iid_tokens[0], "closed in repo"].join(" ");
                        new Notice(message);
                        console.log(message);
                    } else {
                        bad_tasks_alerts.push([task.cts.feature_tokens[0],"/",task.title,"/",task.cts.iid_tokens[0],"was closed in repo. Please check!"].join(" "));    
                    }
                } else {
                    bad_tasks_alerts.push([task.cts.feature_tokens[0],"/",task.title,"/",task.cts.iid_tokens[0],"should have an open issue"].join(" "));
                }
            } else {
                bad_tasks_alerts.push([task.cts.feature_tokens[0],"/",task.title,"/",task.cts.iid_tokens[0],"not found in repo"].join(" "));
            }
        }

    } else if (task.status_code > " ") {
        // task may need to be created as an issue in repo

        let assignees = logins.filter(l => l.startsWith(task.status_code.toLowerCase()));

        // console.log(assignees);

        if (assignees.length == 0) {           
            const message = "Cannot determine assignee from status code [" + task.status_code + "]";
            new Notice (message);
            console.log(message);
        } else {
            let description = "" + task.description;
            const mapped_tokens: string[] = [];
            task.cts.feature_tokens.forEach((token) => {
                mapped_tokens.push(token);
            });
            task.cts.priority_tokens.forEach((token) => {
                mapped_tokens.push(prioNameFromToken(token));
            });
            task.cts.product_tokens.forEach((token) => { 
                mapped_tokens.push(token);
            });
            if (task.cts.tid_tokens.length == 0) {
                // add the t_id token to the task
                editor.setSelection({ line: task.start, ch: 0 }, { line: task.start+1, ch: 0 });
                if (editor.getSelection().startsWith(renderTask(task,view_params))) {
                    task.cts.tid_tokens.push(generateUniqueId(set_ids));
                    description = "synced from task " + task.cts.tid_tokens[0] + "\n" + task.description;
                    editor.replaceSelection(renderTask(task,view_params) + "\n");
                    const message = [`Task for new issue updated with ${task.cts.tid_tokens[0]}`].join(" ");
                    new Notice(message);
                    console.log(message);
                } else {
                    const message = [`Task for new issue could not be updated with ${task.cts.tid_tokens[0]}`].join(" ");
                    new Notice(message);
                    console.log(message);
                }
            } else {
                task.cts.tid_tokens.forEach((token) => { 
                    mapped_tokens.push(token);
                });
            }

            // console.log(["New issue to be created: ", task.cts.feature_tokens[0], "/", task.title, "/"].join(" "));
            
            let new_issues: Issue[] = await api_submit_issue(
                octokit,
                view_params,
                {   title: task.title,
                    description: description,
                    labels: mapped_tokens,
                    assignees: assignees
                } as SubmittableIssue
            );

            if (new_issues.length == 1) {
                issues.push(new_issues[0]);
                iids.push("#" + new_issues[0].number);
                task.cts.iid_tokens.push(new_issues[0].cls.iid_labels[0].name);
                editor.setSelection({ line: task.start, ch: 0 }, { line: task.start+1, ch: 0 });
                const new_task = renderTask(task, view_params) + "\n";
                editor.replaceSelection(renderTask(task, view_params) + "\n");
                const message = ["New issue created: ", task.cts.feature_tokens[0], "/", task.title, "/"].join(" ");
                new Notice (message);
                console.log(message);
            } else {
                const message = ["Cannot create new issue", task.cts.feature_tokens[0], "/", task.title, "/"].join(" ");
                bad_tasks_alerts.push(message);
                new Notice (message);
                console.log(message);
            }
        }
    }
} 
