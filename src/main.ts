import * as core from '@actions/core';
const Github = require('@actions/github');
const { Octokit } = require("@octokit/rest");
const { retry } = require("@octokit/plugin-retry");
const githubToken = core.getInput('github_token', { required: true });
const context = Github.context;
const MyOctokit = Octokit.plugin(retry)
const octokit = new MyOctokit({
  auth: githubToken,
  request: {
    retries: 4,
    retryAfter: 60,
  },
});

async function run() {
  const owner = core.getInput('owner', { required: false }) || context.repo.owner;
  const base = core.getInput('base', { required: false });
  const head = core.getInput('head', { required: false });
  const mergeMethod = core.getInput('merge_method', { required: false });
  const prTitle = core.getInput('pr_title', { required: false });
  const prMessage = core.getInput('pr_message', { required: false });
  const ignoreFail = core.getInput('ignore_fail', { required: false });
  const autoApprove = core.getInput('auto_approve', { required: false });
  const personalToken = core.getInput('personal_token', { required: false });


  try {
    let listTags = await octokit.repos.listTags({
      owner: owner, 
      repo: context.repo.repo
    });

    let listReleases = await octokit.repos.listReleases({
      owner: owner,
      repo: context.repo.repo,
    });
    
    // console.log('listTags: ', listTags);
    // console.log('listReleases: ', listReleases);

    listTags.data.forEach( async (tag) => {
      console.log(tag.name + ' sha1: ', tag.commit.sha);
      let getTag;
      try {
        getTag = await octokit.git.getTag({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag_sha: tag.commit.sha,
        });
      } catch(error) {
        console.log('getTag error', error);
        getTag = false;
      }

      console.log('getTag', getTag);

      if ( getTag === false ) {
        await octokit.git.createTag({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag: tag.name,
          message: '',
          object: tag.commit,
          type: 'commit'
        });
      }
    });
    

  } catch(error) {
    console.log('tags error: ', error);
  }

  try {
    let pr = await octokit.pulls.create({ owner: context.repo.owner, repo: context.repo.repo, title: prTitle, head: owner + ':' + head, base: base, body: prMessage, merge_method: mergeMethod, maintainer_can_modify: false });
    await delay(20);
    if (autoApprove) {
      if (!personalToken){
        console.log('Cannot auto-approve, please set "personal_token"-variable');
      }
      else {
        // Authenticate as current user
        const octokitUser = new MyOctokit({auth: personalToken});
        await octokitUser.pulls.createReview({ owner: context.repo.owner, repo: context.repo.repo, pull_number: pr.data.number, event: "COMMENT", body: "Auto approved" });
        await octokitUser.pulls.createReview({ owner: context.repo.owner, repo: context.repo.repo, pull_number: pr.data.number, event: "APPROVE" });
      }
    }
    await octokit.pulls.merge({ owner: context.repo.owner, repo: context.repo.repo, pull_number: pr.data.number });
  } catch (error) {
    if (error.request.request.retryCount) {
      console.log(
        `request failed after ${error.request.request.retryCount} retries with a delay of ${error.request.request.retryAfter}`
      );
    }
    if (!!error.errors && !!error.errors[0] && !!error.errors[0].message && error.errors[0].message.startsWith('No commits between')) {
      console.log('No commits between ' + context.repo.owner + ':' + base + ' and ' + owner + ':' + head);
    } else {
      if (!ignoreFail) {
        core.setFailed(`Failed to create or merge pull request: ${error ?? "[n/a]"}`);
      }
    }
  }
}

function delay(s: number) {
  return new Promise( resolve => setTimeout(resolve, s * 1000) );
}

run();
