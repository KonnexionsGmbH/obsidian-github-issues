import {TaskLabels} from "../Issues/Issue";

/**
 * Task class
 */
export class Task {
    start: number;              // line number in 'ReleasesNote'
    end:   number;              // next line after Feature or ReleasesNote.length  
    title: string;              // text without tags
    task_labels: TaskLabels;    // feature tags, normal tags, platform tags, issue tags (max. one)
    sort_string: string[];
    status_code: string;        // " ": todo, "x":done, "s": assigned Sven, "S": working Sven, etc.

    constructor(start: number, end: number, title: string, task_labels: TaskLabels, sort_string: string[], status_code: string) {
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

