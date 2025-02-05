import { TaskLabels, getIssueSortKey, IssueSortOrder, shortName } from "../Issues/Issue";
import { Label } from "../API/ApiHandler";
import { Editor } from "obsidian";
import { IssueViewParams } from "../main";

/**
 * Task class
 */
export class Task {
    start: number;              // line number in 'ReleasesNote'
    end:   number;              // next line after Feature or ReleasesNote.length  
    title: string;              // text without tags
    task_labels: TaskLabels;    // feature tags, normal tags, platform tags, issue tags (max. one)
    sort_string: string;
    status_code: string;        // " ": todo, "x":done, "s": assigned Sven, "S": working Sven, etc.

    constructor(start: number, end: number, title: string, task_labels: TaskLabels, sort_string: string, status_code: string) {
        this.start = start;
        this.end = end;
        this.title = title;
        this.task_labels = task_labels;
        this.sort_string = sort_string;
        this.status_code = status_code;
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
    // - [ ] #task One more task #Core #Server #102 🔺 🛫 2025-02-01 ✅ 2025-01-31
    // - [ ] #task One more task #Core #Server #102 🔼 🛫 2025-02-01
    // - [ ] #task One more task #Core #Server #102 🔽 🛫 2025-02-01
    // - [ ] #task One more task #Core #Server ⏫
    // - [ ] #task One more task #Core #Server #102 🔺 🔁 every day 🛫 2025-02-01 ❌ 2025-01-31
    // - [ ] #task One more task #Core #Server #102 ⏬ 🛫 2025-02-01
    // - [x] #task Description comes here 🆔 uo7126 ⛔ t3ls4p ⏫ ➕ 2025-02-03 ⏳ 2025-01-24 📅 2025-02-07

    const prios = "⏬🔽 🔼⏫🔺";		// prio0 .. prio5, prio2 = normal doesnot happen
    const dates = "➕⏳📅🛫✅❌🔁";
    const links = "⛔🆔";
    
    const task_pos = line.indexOf("#task");
    const title_pos = task_pos + 6;
    const words: string[] = line.substring(title_pos).split(" ");

    let mapped_labels: Label[] = [];
    mapped_labels.push({
        name: this_feature,
        color: "aaaaaa"
    } as Label);
    
    let titles: string[] = [];
    let done = false;
    
    words.forEach((word) => {
        if (done == false) {
            let prio = prios.indexOf(word.substring(0, 1));
            if (prio > 3) {
                mapped_labels.push({
                    name: "p_critical",
                    color: "d93f0B"
                } as Label);
                done = true;
            } else if (prio > 2) {
                mapped_labels.push({
                    name: "p_high",
                    color: "e99695"
                } as Label);
                done = true;
            } else if (prio > 0) {
                mapped_labels.push({
                    name: "p_low",
                    color: "9ce8c6"
                } as Label);
                done = true;
            } else if (prio == 0) {
                mapped_labels.push({
                    name: "p_backlog",
                    color: "49ee25"
                } as Label);
                done = true;
            }
            if (dates.contains(word)) {
                done = true;
            } else if (links.contains(word)) {
                done = true;
            } else if (word.startsWith("#")) {
                mapped_labels.push({
                    name: word,
                    color: "ffffff"
                } as Label);
            } else {
                titles.push(word);
            }
        }
    })
    this_task = titles.join(" ");
    const tl = new TaskLabels(mapped_labels, view_params);
    // console.log("startNewTask with mapped labels: ", mapped_labels);
    tacc.push(new Task(i, 0, this_task, tl, getIssueSortKey(this_task, tl, IssueSortOrder.feature), line.substring(task_pos - 3, task_pos - 2)));
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
            } else if (line.startsWith("#")) {
                [this_feature, this_task] = finishFeature(this_feature, this_task, facc, tacc, i);
            } else if ((line.indexOf("#task") > 3) && (line.contains("- ["))) {
                [this_feature, this_task] = startNewTask(this_feature, this_task, tacc, i, line, view_params); // but finish this_task first if needed
            } 
        }
    }
    if (this_feature.length > 0) {
        [this_feature, this_task] = finishFeature(this_feature, this_task, facc, tacc, editor.lineCount());
    }
    console.log(facc);
    return facc;
}

export function collectBadTaskAlerts(facc: Feature[], view_params: IssueViewParams): string[] {
    let bad_task_alerts: string[] = [];
    const id_labels = new Set<string>(); // issue ids for this repo over all features
    facc.forEach((feature) => {
        feature.tasks.forEach((task) => {
            const ids:string[] = task.task_labels.id_labels.map(label => label.name);
            const rts:string[] = [];    // repo tokens
            const ots:string[] = [];    // other tokens
            task.task_labels.platform_labels.map(label => label.name).forEach((n) => {
                if (view_params.repo_tokens.some( token => token == n )) {
                    rts.push(n);
                } else if (view_params.other_tokens.some( token => token == n )) {
                    ots.push(n);
                }
            });
            if ((rts.length > 0) && (ots.length > 0)) {
                bad_task_alerts.push([feature.tag, "'", task.title, "'"].concat(ids).concat(["spans multiple repos"]).join(" "));
            }
            if (rts.length > 0) {
                ids.forEach((id) => {
                    if (id_labels.has(id)){
                        bad_task_alerts.push([feature.tag, "'", task.title,"'"].concat([shortName(id)]).concat(["conflicts with same id above"]).join(" "));
                    } else {
                        id_labels.add(id);
                    }
                });
            }
        })
    })

    return bad_task_alerts;
}