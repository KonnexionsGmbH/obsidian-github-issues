import { Issue, ClassLabels, IssueSortOrder, issueSortKey } from "../Issues/Issue";
import { Label } from "../API/ApiHandler";
import { Editor, Notice } from "obsidian";
import { IssueViewParams } from "../main";


/**
 * ClassLabels class
 */
export class ClassTokens {

    feature_tokens: string[];
    product_tokens: string[];
    id_tokens: string[];
    foreign_tokens: string[];
    priority_tokens: string[];
    other_tokens: string[];

    constructor(mapped_tokens: string[], view_params: IssueViewParams, iid?: number) {
        const prios = "⏬🔽🔼⏫🔺";	// prio0 .. prio4
        const tid_token = "🆔";		    // task ID

        const pts: string[] = view_params.product_tokens;
        const fts: string[] = view_params.foreign_tokens;
        this.feature_tokens = [];
        this.product_tokens = [];
        this.id_tokens = [];
        this.foreign_tokens = [];
        this.priority_tokens = [];
        this.other_tokens = [];    // dates, periodicity

        const sorted_tokens = mapped_tokens.sort((t1,t2) => {
            if (t1 > t2) {
                return 1;
            }
            if (t1 < t2) {
                return -1;
            }
            return 0;
        });
        if (iid !== undefined) {
            sorted_tokens.push("#" + iid);
        } 

        sorted_tokens.filter(t => t.length > 0).forEach((token) => {
            if (pts.some( pts_token => token == pts_token )) {
                this.product_tokens.push(token);
            }
            else if (fts.some( fts_token => token == fts_token )) {
                this.foreign_tokens.push(token);
            }
            else if (token.startsWith('#')) {
                if (isNaN(+token.substring(1))) {
                    this.feature_tokens.push(token);
                }
                else {
                    this.id_tokens.push(token);
                }
            } else if ( prios.indexOf(token) > -1 ) {
                this.priority_tokens.push(token) 
            } else if (token.startsWith(tid_token)) {
                this.id_tokens.push(token);
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

    constructor(start: number, end: number, t: string, cts: ClassTokens, sort: string, status: string) {
        this.start = start;
        this.end = end;
        this.title = t;
        this.description = "";  // not in constructor because not known in time
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
    const names = ['p_backlog', 'p_low', 'p_high', 'p_highest', 'p_critical' ];
    const prios = "⏬🔽🔼⏫🔺";		// prio0 .. prio4
    const idx = names.indexOf(label.name);
    switch  (idx) {
		case 0: { return "⏬"; break;};
		case 1: { return "🔽"; break;};
		case 2: { return "🔼"; break;};
		case 3: { return "⏫"; break;};
		case 4: { return "🔺"; break;};
        default: {return ""; break;}
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
    cts.id_tokens.forEach((token) => {
        res.push(token);
    });

    return res.join();
}

function pushTaskDescription(this_feature: string, this_task:string, tacc: Task[], line:string) {
    if (this_task.length > 0) {
        tacc[tacc.length-1].description += "\n".concat(line);
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
       
    tacc.push(new Task(i, 0, this_task, cts, taskSortKey(this_task, cts), line.substring(task_pos - 3, task_pos - 2)));
    return [this_feature,this_task];
}

function finishFeature(this_feature: string, this_task: string, facc: Feature[], tacc: Task[], i: number): [string,string] {

    if (facc[facc.length-1].tag == this_feature) {
        facc[facc.length-1].end = i;
        if (this_task.length > 0) {
            [this_feature, this_task] = finishTask(this_feature, this_task, tacc, i);
        }
        facc[facc.length - 1].tasks = tacc;
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
    return [this_feature, ""];
}

export function parseTaskNote(editor: Editor, view_params: IssueViewParams): Feature[] {
    let facc: Feature[] = [];
    let tacc: Task[] = [];
    let this_feature = "";
    let this_task = "";
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
    // console.log(facc);
    sortAndPruneTasksNote(editor, facc, view_params);
    // console.log(facc);
    return facc;
}

function sortAndPruneTasksNote( editor: Editor, facc: Feature[], view_params: IssueViewParams) {
    let compression = 0;
    for (let f = 0; f < facc.length; f++) {
        if ((!facc[f].hidden) && (facc[f].tasks.length > 0)) {
            // sort tasks within this feature and remove empty lines
            let acc = "";
            let r_start = facc[f].tasks[0].start + compression; // tasks to be sorted start here
            let r_end = facc[f].end + compression;     // replace text up to the end of the task
            let idx = r_start;  // start index for next task
            facc[f].start += compression;
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
            compression = compression + idx - r_end; // correct feature.end and following features with this
            // console.log("New compression: ", compression);
            facc[f].end += compression;
            // console.log(acc);
            editor.replaceRange(acc, {line: r_start, ch: 0}, {line: r_end, ch: 0});
        }
    }
}

export function collectBadTaskAlerts(facc: Feature[], view_params: IssueViewParams): [string[], Set<string>] {
    const bad_task_alerts: string[] = [];
    const idns = new Set<string>();     // issue ids for this repo over all features
    facc.forEach((feature) => {
        feature.tasks.forEach((task) => {
            const iids:string[] = task.cts.id_tokens;
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
                bad_task_alerts.push([feature.tag, "'", task.title, "'"].concat(iids).concat(["spans multiple repos"]).join(" "));
            }
            iids.forEach((iid) => {
                if (iid.startsWith("#")) {
                    if (pts.length > 0) {
                        // only consider other iids for same repo
                        if (idns.has(iid)) {
                            bad_task_alerts.push([feature.tag, "'", task.title,"'"].concat(iid).concat(["conflicts with same id above"]).join(" "));
                        } else {
                            idns.add(iid);
                        }
                    }
                } else if (idns.has(iid)) {
                    bad_task_alerts.push([feature.tag, "'", task.title,"'"].concat(iid).concat(["conflicts with same id above"]).join(" "));
                } else {
                    idns.add(iid);
                }
            });
        })
    })
    console.log("All ID Set: " , idns);
    return [bad_task_alerts, idns] ;
}

function renderTask(task: Task, view_params: IssueViewParams): string {
    const header = '- [' + task.status_code + '] ' + view_params.task_token;        
    const res = [header, task.title].concat(
            task.cts.product_tokens).concat(
            task.cts.foreign_tokens).concat(
            task.cts.id_tokens).concat(     
            task.cts.priority_tokens).concat(
            task.cts.other_tokens).join(" ");        // .map(iid => shortIidToken(iid))
    // console.log("renderTask: ", res);
    return res;
}

function statusCodeFromAssignee( assignee: string ): string {
    // console.log( "Assignee to be inserted: ", a);
    // simple hack which supports 25 contributors but their GitHub login must start with different letters
    // need to peel out the user name from the task plugin configuration where the custom task states are named
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

export function issueToTaskSync(issue: Issue, view_params:IssueViewParams, editor: Editor, facc: Feature[], idns: Set<string>) {
    const tid_token = "🆔";
    
    if (issue.cls.feature_labels.length > 1) {
        issue.findings.push('Issue cannot have more than one feature label');
    } else if (issue.cls.feature_labels.length == 0) {
        issue.findings.push('Issue will not be synced to Obsidian without a feature label');
    } else if (issue.cls.priority_labels.length > 1) {
        issue.findings.push('Issue cannot have more than one priority label');
    } else if (issue.cls.product_labels.length == 0) {
        issue.findings.push('Issue must have one or more product labels which are managed in this repo');
    } else {
        let findings: string[] = [];
        
        // issue has one feature and at least one product label, maybe we can sync it with tasks
        const i_feature = issue.cls.feature_labels[0].name; // issue has a feature label
        const i_id = issue.cls.id_labels[0].name;           // issue's id (long format)
        let t_task: Task;
        let t_found = false;
        if ( idns.has(i_id) ) {   
            // task exists with id, find it in facc and check title, feature, assignee and labels
            for (let f = 0; f < facc.length; f++) {
                if (facc[f].tag == i_feature) {   // search for task under correct feature only
                    for (let t = 0; t < facc[f].tasks.length; t++) {
                        if (facc[f].tasks[t].cts.id_tokens.some(token => token == i_id)) {
                            // task has the i_id token
                            t_task = facc[f].tasks[t];
                            t_found = true;
                            if (t_task.cts.id_tokens.length < 2) {
                                // findings.push('Task does not have a task ID.');
                            } else if (issue.description.contains(t_task.cts.id_tokens[1])) {
                                // match, nothing to do
                            } else if (issue.description.contains(tid_token)) {
                                findings.push('Task ID does not match link in issue description.');
                            } else { 
                                issue.description = "synced to task " + t_task.cts.id_tokens[1] + "\n" + issue.description;
                                findings.push("Task ID link added to issue description.");
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
            if (findings.length > 0) {
                new Notice(`Syncing issue ${i_id} to tasks had ${findings.length} findings.`);
                issue.findings = findings;
            }

        } else {  

            // no task with this id exists, we assume that it was created on GitHub and
            // insert it into the ReleasesNote under its feature (if that exists there)
            let f_inserted = -1;    // point to feature where task is to be inserted
            let t_inserted = -1;    // point to task where it is to be inserted
            let t_start = -1;       // editor line number where task is to be inserted
            for (let f = 0; f < facc.length; f++) {
                if (facc[f].tag == i_feature) {   
                    // feature found
                    const sorted_tasks = facc[f].tasks.sort((t1, t2) => {
                        if (t1.sort_string > t2.sort_string) {
                            return 1;
                        }
                        if (t1.sort_string < t2.sort_string) {
                            return -1;
                        }
                        return 0;
                    });
                    const i_sort_string = issueSortKey(issue.title, issue.cls, IssueSortOrder.feature);
                    for (let t = 0; t < sorted_tasks.length; t++) {
                        if (sorted_tasks[t].sort_string > i_sort_string) {   
                            t_start = sorted_tasks[t].start; // insert before this line
                            t_inserted = t;  // new task gets this task index
                            break;                    
                        }
                    }
                    if (t_start == -1) {
                        t_start = facc[f].end; // new task goes to the end of the feature;
                        t_inserted = facc[f].tasks.length;  // index of new task
                    } else {
                        for (let t = 0; t < facc[f].tasks.length; t++) {
                            if (facc[f].tasks[t].start == t_start) {   
                                t_inserted = t;  // new task gets this task index
                                break;                    
                            }
                        }    
                    }
                    // edit the ReleasesNote 
                    f_inserted = f;
                    break;
                }
            }

            if (f_inserted > -1) {
                // we want to insert a task. fot that, we need to correct
                // the facc line number indexing so that we can use it for the next issue
                // create task properties from the issue object 
                const status_code = statusCodeFromAssignee(issue.assignee);
                const mapped_tokens: string[] = []; // 
                issue.cls.feature_labels.map(label => label.name).forEach(token => mapped_tokens.push(token));
                issue.cls.product_labels.map(label => label.name).forEach(token => mapped_tokens.push(token));
                issue.cls.id_labels.map(label => label.name).forEach(token => mapped_tokens.push(token));
                issue.cls.priority_labels.forEach(label => mapped_tokens.push(prioTokenFromLabel(label)));

                // console.log("Inserting Issue with these mapped_tokens: ", mapped_tokens);
                
                const cts = new ClassTokens(mapped_tokens, view_params); 
                const sort_string = taskSortKey(issue.title, cts);
                const new_task = new Task(t_start, t_start+1, issue.title, cts, sort_string, status_code);
                editor.setCursor({ line: t_start, ch: 0 });
                editor.replaceSelection(renderTask(new_task, view_params) + "\n");
                new Notice("Inserting new task from issue #" + issue.number);
                console.log("Inserting new task from issue #" + issue.number);
                facc[f_inserted].tasks.splice(t_inserted, 0, new_task);
                for (let f = 0; f < facc.length; f++) {
                    if (f == f_inserted) {
                        for (let t = t_inserted+1; t < facc[f].tasks.length; t++) {
                            facc[f].tasks[t].start += 1;
                            facc[f].tasks[t].end += 1;
                        };
                        facc[f].end += 1;
                    }
                    if (f > f_inserted){
                        facc[f].start += 1;
                        for (let t = 0; t < facc[f].tasks.length; t++) { 
                            facc[f].tasks[t].start += 1;
                            facc[f].tasks[t].end += 1;
                        };
                        facc[f].end += 1;
                    }
                }
            }
            
            if (issue.cls.foreign_labels.length > 0) {
                // check if we need to insert a task for a foreign repo
                // we don't have an issue id for that and must search for
                // title and foreign product token

                // tbd
            }
        }
    }
}

export function taskToIssueSync(task: Task, view_params: IssueViewParams, editor: Editor, facc: Feature[], idns: Set<string>, issues: Issue[]) {


} 
