# Note

<p align="center">
This plugin is still under development and contains bugs! It is forked from https://github.com/frostplexx/obsidian-github-issues but follows a semi-manual approach to keeping an obsidian note (kind of a release plan) in sync with one or more repos in GitHub. 
</p>

# Obsidian GitHub Issues

Obsidian GitHub Issues is a plugin for the Obsidian note-taking app that enables users to integrate GitHub issues from multiple repos into their notes. With this plugin, you can synchronize existing GitHub issues to Obsidian tasks in a note which represents a release plan. You can create new issues in Git from assigned tasks in Obsidian or edit existing issues directly from within Obsidian.

## Features

-   **Issue syncing to tasks:** Embed existing GitHub issues into your Obsidian note. This allows you to reference and view relevant issues alongside your notes.
-   **Create new issues from tasks:** Easily create new GitHub issues without leaving the Obsidian app. This feature streamlines your workflow by eliminating the need to switch between applications.
-   **Edit existing issues:** Edit and update existing GitHub issues directly from within Obsidian. You can read comments, change the issue title or body, change assigned labels, append comments and close the issue without having to navigate to GitHub
-   **Bidirectional sync:** Changes made to tasks in Obsidian are automatically (or semi-automatically) synchronized with the corresponding GitHub issues, ensuring seamless collaboration between your Obsidian notes and multiple GitHub repositories.
-   **Rich preview:** View a comprehensive preview of the embedded issues, including their status, comments, assignees, labels, and other relevant details. This feature helps you quickly gain context and stay informed about the progress of your issues.

## Installation

- Install, enable and configure the Tasks plugin. Configure two custom tasks states per co-worker in all repos:
  e.g.   [a] for "assigned Alex"  and [A] for "working Alex"  etc. 

### Prerequisites

Before installing the Obsidian GitHub Issues plugin, you need to generate a Personal Access Token (PAT) for your GitHub account. This token is used to authenticate your Obsidian app with GitHub and enable the plugin to access your GitHub repositories. To generate a PAT, follow these steps:

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
-   Click on the "Generate Token" button.
-   Copy the generated token and save it somewhere safe.
-   **Note:** This token is only displayed once. If you lose it, you will have to generate a new one.

### Install from GitHub

To install the Obsidian GitHub Issues plugin from GitHub, follow these steps:

-   Download the latest release of the plugin from the releases page (Its the file with the .zip ending).
-   Extract the the following files of the zip file into your Obsidian vault's plugins folder:
-   manifest.json / main.js / styles.css / data.json
-   Copy snippet.css to the .obsidian/snippets/ config folder (rename if necessary)
-   Open the plugin settings and enter your GitHub Username and Personal Access Token
-   You can also leave Username and PAT empty and instead put them into OS environment variables GIT_USER / GIT_PAT
-   Reload Obsidian to activate the plugin.

## Usage

To Embed the Issues of a GitHub repo as tasks into your Obsidian 'ReleasesNote', use something like:

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
- Your tasks are tagged with #task.
- Product features which should not be synced yet can be tagged with #hidden.
- The repo acessed with this (note/query) is named repo_name and owned by repo_owner.
- The repo is used to develop products/components labelled with #Core, #Server and #User
- and also serves for overall platform development issues (#Repo, #PM).
- The issues in this repo can also be related to #App and #Intelligence but those 
- products/components are managed in separate (foreign) repos. Picking these labels only remind
- of dependencies to other repos.
- Product tags without repo name are assumed to be managed in this repo.
- Manually create and color all product/component labels (local and foreign) in the Github repo.
- Manually create and color all priority labels in the Github repo.
| code       | Description                               |
| ---------  | ----------------------------------------- |
| p_backlog  | Priority lowest |
| p_low      | Priority low | 
| p_high     | Priority high |
| p_highest  | Highest normal priority (below critical) |
| p_critical | Priority highest |

Switch a query page to edit view and back to do a sync cycle.

Format of the 'ReleasesNote':

Level 2 headings: Relase names

Level 3 headings starting with a feature tag can optionally be tagged as #hidden in the remainder of the line
Non-Task lines after a feature-heading describe the nature of the feature (not synced to Git).

Task lines: Tasks belong to above mentioned feature in the heading. They should contain a title and one or more product tags for the same repo. Task lines with same title but different product tag (for same or different repo) form a group of tasks which usually depend on each other. The synchronizer will complement each task line with ID tags (IssueID from Git, TaskID from Obsidian). A new task must not have an IssueID but may have a TaskId if other tasks depend on it.   

Non-Task lines belong to the Task line above and are (initially) pushed to Git as issue body.
This text can later (after the first sync to Git) be removed to improve the oversight.
Pushing a task to Git is delayed until the task is assigned to a person (unless the feature is #hidden). This allows for a release planning which does not clutter Git with future issues and feature tags.

Features which are not labelled as #hidden are pushed to Git labels automatically. They can optionally be colored there. Automatic removal of feature tags remains to be implemented but can be done manually for now. Hide or archive historical features first.







