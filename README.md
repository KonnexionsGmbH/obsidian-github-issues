# Note

<p align="center">
This plugin is still under development and still contains bugs! It is forked from https://github.com/frostplexx/obsidian-github-issues but follows a semi-manual approach to keeping an obsidian note (kind of a release plan) in sync with one or more repos in GitHub. 
</p>

# Obsidian GitHub Issues

Obsidian GitHub Issues is a plugin for the Obsidian note-taking app that enables users to integrate GitHub issues from multiple repos into their notes. With this plugin, you can synchronize existing GitHub issues to Obsidian tasks in a single note which represents a release plan across multiple repos. You can create new tasks for future developments in the release plan. Assigning a reponsible person to such a task (via task status) will open a GitHub issue and establish a link for keeping them in 2-way sync. This is done in a separate query-note per repo. There you can browse and edit existing issues directly from within Obsidian.

## Features

-   **Issue syncing to tasks:** Embed existing GitHub issues into your Obsidian note (the release plan). This allows you to reference and view relevant issues alongside your notes.
-   **Create new issues from tasks:** Easily create new Obsidian tasks and push them to GitHub as issues without leaving the Obsidian app. This feature streamlines your workflow by eliminating the need to switch between applications.
-   **Edit existing issues:** Edit and update existing GitHub issues directly from within Obsidian in a query-view per repo. You can read comments, change the issue title or body, change assignees and assigned labels, append comments and close the issue without having to navigate to GitHub.
-   **Bidirectional sync:** Changes made to tasks in Obsidian are automatically (or semi-automatically) synchronized with the corresponding GitHub issues, ensuring seamless collaboration between your Obsidian notes and multiple GitHub repositories. This happens only for repos which have their query-view open in the Obsidian workspace and only on query-refresh. Shape or re-structure your release plan with GitHub query notes closed.
-   **Rich preview:** View a comprehensive preview of the embedded issues, including their status, comments, assignees, labels, and other relevant details. This feature helps you quickly gain context and stay informed about the progress of your issues.

## Installation

-   Install, enable and configure the Tasks plugin. Configure two custom tasks states per co-worker (e.g.):
   [a] for "alex_avatar assigned"  and
   [A] for "alex_avatar working"  etc.
   Put the GitHub login of the person first, then a space. The rest of the text is technically ignored. Instead of 'working', one could twist the meaning and choose 'completed'. This would make sense if one wanted to keep the issue in the query and in the sync process until all other tasks in the group are also completed (and then can be closed at once).
   
   Two task states will allow two levels of assignment/work in progress but this information is not forwarded to GitHub. The sync process only makes sure that the assigned person is among the assignees in GitHub.

### Prerequisites

Before installing the Obsidian GitHub Issues plugin, you need to generate a Personal Access Token (PAT) for your GitHub account. This token (which expires and needs to be refreshed from time to time) is used to authenticate your Obsidian app with GitHub and enables the plugin to access your GitHub repositories. To generate a PAT, follow these steps:

-   Navigate to your GitHub account settings.
-   Click on the "Developer Settings" tab.
-   Select "Personal Access Tokens" from the sidebar.
-   Click on the "Generate New Token (classic)" button.
-   Give it a name and an expiration date.
-   The token needs the following permissions:
    -   If you want to use the plugin with public and private repositories, you need to select the following permissions:
        -   repo (Full control of private repositories)
    -   If you only want to use the plugin with public repositories, you need to select the following permissions:
        -   public_repo (Access public repositories)
-   Click on the "Generate Token" button
-   Copy the generated token and save it somewhere safe.
-   **Note:** This token is only displayed once. If you lose it, you will have to generate a new one.

### Install from GitHub

To install the Obsidian GitHub Issues plugin from GitHub, follow these steps:

-   Download the latest release of the plugin from the releases page (the file with the .zip ending).
-   Extract the the following files of the zip file into your Obsidian vault's plugins folder: 
   manifest.json / main.js / styles.css / data.json
-   Copy snippet.css to the .obsidian/snippets/ config folder (rename if necessary)
-   Open the plugin settings and enter your GitHub Username and Personal Access Token
-   You can also use OS environment variables GIT_USER / GIT_PAT instead to keep the cloud clean
-   Reload Obsidian and activate the plugin.

## Usage

To view the Issues of a GitHub repo and embed them as tasks into your Obsidian 'ReleasesNote', create a new note for the dynamic GitHub query. Insert a query parameter block with something like this:

````markdown
```github-issues
repo_owner/repo_name
ReleasesNote
#task
#hidden
#App/other_repo_1
#Core
#Intelligence/other_repo_2
#Server
#User
#Repo
#PM
```
````

and open this query note (and maybe others for different repos) side by side to the 'ReleasesNote'.

This assumes that:
-   Your tasks are tagged with #task.
-   Product features which should not be synced yet can be tagged with #hidden (see below).
-   The repo acessed with this (note/query) is named repo_name and owned by repo_owner.
-   The repo is used to develop products/components labelled with #Core, #Server and #User and also serves for overall platform coordination issues (#Repo, #PM).
-   The issues in this repo can also be related to #App and #Intelligence but those products/components are managed in separate (foreign) repos. Picking these labels will only remind of dependencies to other repos.
-   Product tags without repo name are assumed to be
 managed in this repo.
-   Manually create and color all product/component labels (local and foreign) in the Github repo.
-   Manually create and color all priority labels in the Github repo. Use label names as follows:

| symbol | label name  | label description (change as you wish)    |
| ------ | ----------  | ----------------------------------------- |
| ⏬     | p_backlog  | Priority lowest |
| 🔽     | p_low      | Priority low | 
| 🔼     | p_high     | Priority high |
| ⏫     | p_highest  | Highest normal priority (below critical) |
| 🔺     | p_critical | Priority highest |

Switch the query block to edit mode and back (click outside) to do a sync cycle.

The synchronizer will run per repo and only if the github query view is refreshed, which will happen if:
-   The release plan and query note both are opened side by side on Obsidian start up   
-   The query block is toggled to edit mode (using the "</>" button) and back (focus leave)

First the release plan is checked for consistency. Alerts will try to explain the problems which must be fixes manually in the markdown text or using the tasks modal.

Then the live view of the open issues in GitHub will be scanned to see if any issue should be inserted as a task or if a linked issue needs an update. Since the sync is stateless, it does not know who changed what and when on either side. It tries to only to do safe things and falls back to alerting the user if there is a dicrepancy which cannot be automatically resolved.

The reverse sync step then checks if a task has recently be assigned a responsible person in which case, a matching issue in GitHub is opened.

### Assumed format of the 'ReleasesNote' (Release Plan):

#### Level 2 headings
Contain a release name, optionally prefixed with a release version number.
They may be followed with a text section which explain the reason or nature of planned future release. This info should give enough information for a GitHub release workflow but is not synced in any way to GitHub. 

#### Level 3 headings
Should start with a feature tag (in the Obsidian sense) and can optionally be tagged as #hidden in the remainder of the line.
Non-Task lines after a feature-heading describe the nature of the feature (not synced to Git).

Task lines: Are formatted according to the Obsidian Tasks plugin. Tasks belong to above mentioned feature in the heading. They should contain a title and one or more product tags for the same repo. Multiple Task lines with same title but different product tags (for same or different repo) may form a group of tasks which usually depend on each other. The synchronizer will complement each task line with ID tags (IssueID from Git, TaskID from Obsidian). A new task must (before sync) not have an IssueID but may already have a TaskId if other tasks depend on it. TaskIds must be unique in the release plan. Issues IDs must be unique per repo (via the product to repo association in the query config). The synchronizer will create both types of IDs if needed.

Non-Task lines belong to the Task line above and are (initially) pushed to Git as issue body.
This text can later (after the first sync to Git) be removed to improve the oversight in the release plan.
Pushing a task to Git is delayed until the task is assigned to a responsible person (unless the feature is #hidden). This allows for a release planning which does not clutter Git with future issues and feature labels.

Features which are not labelled as #hidden are pushed to Git labels automatically. They can optionally be colored there. Automatic removal of feature tags remains to be implemented but can be done manually for now. Remember to hide historical features first or archive them in a separate archive note. 







