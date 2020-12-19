"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const Github = require('@actions/github');
const { Octokit } = require("@octokit/rest");
const { retry } = require("@octokit/plugin-retry");
const githubToken = core.getInput('github_token', { required: true });
const context = Github.context;
const MyOctokit = Octokit.plugin(retry);
const octokit = new MyOctokit({
    auth: githubToken,
    request: {
        retries: 4,
        retryAfter: 60,
    },
});
function run() {
    return __awaiter(this, void 0, void 0, function* () {
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
            let listTags = yield octokit.repos.listTags({
                owner: owner,
                repo: context.repo.repo
            });
            let listReleases = yield octokit.repos.listReleases({
                owner: owner,
                repo: context.repo.repo,
            });
            // console.log('listTags: ', listTags);
            // console.log('listReleases: ', listReleases);
            listTags.data.forEach(tag => {
                console.log(tag.name + ' sha1: ', tag.commit.sha);
                const getTag = octokit.git.getTag({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    tag_sha: tag.commit.sha,
                });
                console.log('getTag', getTag);
                if (!getTag) {
                    octokit.git.createTag({
                        owner: context.repo.owner,
                        repo: context.repo.repo,
                        tag: tag.name,
                        message: '',
                        object: tag.commit,
                        type: 'commit'
                    });
                }
            });
        }
        catch (error) {
            console.log('tags error: ', error);
        }
        try {
            let pr = yield octokit.pulls.create({ owner: context.repo.owner, repo: context.repo.repo, title: prTitle, head: owner + ':' + head, base: base, body: prMessage, merge_method: mergeMethod, maintainer_can_modify: false });
            yield delay(20);
            if (autoApprove) {
                if (!personalToken) {
                    console.log('Cannot auto-approve, please set "personal_token"-variable');
                }
                else {
                    // Authenticate as current user
                    const octokitUser = new MyOctokit({ auth: personalToken });
                    yield octokitUser.pulls.createReview({ owner: context.repo.owner, repo: context.repo.repo, pull_number: pr.data.number, event: "COMMENT", body: "Auto approved" });
                    yield octokitUser.pulls.createReview({ owner: context.repo.owner, repo: context.repo.repo, pull_number: pr.data.number, event: "APPROVE" });
                }
            }
            yield octokit.pulls.merge({ owner: context.repo.owner, repo: context.repo.repo, pull_number: pr.data.number });
        }
        catch (error) {
            if (error.request.request.retryCount) {
                console.log(`request failed after ${error.request.request.retryCount} retries with a delay of ${error.request.request.retryAfter}`);
            }
            if (!!error.errors && !!error.errors[0] && !!error.errors[0].message && error.errors[0].message.startsWith('No commits between')) {
                console.log('No commits between ' + context.repo.owner + ':' + base + ' and ' + owner + ':' + head);
            }
            else {
                if (!ignoreFail) {
                    core.setFailed(`Failed to create or merge pull request: ${error !== null && error !== void 0 ? error : "[n/a]"}`);
                }
            }
        }
    });
}
function delay(s) {
    return new Promise(resolve => setTimeout(resolve, s * 1000));
}
run();
