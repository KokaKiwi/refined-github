import './deep-reblame.css';
import mem from 'mem';
import React from 'dom-chef';
import select from 'select-dom';
import versionIcon from 'octicon/versions.svg';
import delegate from 'delegate-it';
import * as api from '../libs/api';
import features from '../libs/features';
import loadingIcon from '../libs/icon-loading';
import {getRepoGQL, getReference, looseParseInt, getCleanPathname} from '../libs/utils';

const getPullRequestBlameCommit = mem(async (commit: string, prNumber: number, currentFilename: string): Promise<string> => {
	const {repository} = await api.v4(`
		repository(${getRepoGQL()}) {
			file: object(expression: "${commit}:${currentFilename}") {
				... on Blob {
					id
				}
			}
			object(expression: "${commit}") {
				... on Commit {
					associatedPullRequests(last: 1) {
						nodes {
							number
							mergeCommit {
								oid
							}
							commits(last: 1) {
								nodes {
									commit {
										oid
									}
								}
							}
						}
					}
				}
			}
		}
	`);

	const associatedPR = repository.object.associatedPullRequests.nodes[0];

	if (!associatedPR || associatedPR.number !== prNumber || associatedPR.mergeCommit.oid !== commit) {
		throw new Error('The PR linked in the title didn’t create this commit');
	}

	if (!repository.file) {
		throw new Error('The file was renamed and Refined GitHub can’t find it');
	}

	return associatedPR.commits.nodes[0].commit.oid;
});

async function redirectToBlameCommit(event: delegate.Event<MouseEvent, HTMLAnchorElement | HTMLButtonElement>): Promise<void> {
	const blameElement = event.delegateTarget;
	if (blameElement instanceof HTMLAnchorElement && !event.altKey) {
		return; // Unmodified click on regular link: let it proceed
	}

	event.preventDefault();
	blameElement.blur(); // Hide tooltip after click, it’s shown on :focus

	const blameHunk = blameElement.closest('.blame-hunk')!;
	const prNumber = looseParseInt(select('.issue-link', blameHunk)!.textContent!);
	const prCommit = select<HTMLAnchorElement>('a.message', blameHunk)!.pathname.split('/').pop()!;
	const [, currentFilename] = getCleanPathname().split(getReference()! + '/');

	const spinner = loadingIcon();
	spinner.classList.add('mr-2');
	blameElement.firstElementChild!.replaceWith(spinner);

	try {
		const prBlameCommit = await getPullRequestBlameCommit(prCommit, prNumber, currentFilename);
		const lineNumber = select('.js-line-number', blameHunk)!.textContent!;
		const href = new URL(location.href.replace(getReference()!, prBlameCommit));
		href.hash = 'L' + lineNumber;
		location.href = String(href);
	} catch (error) {
		spinner.replaceWith(versionIcon());
		alert(error.message);
	}
}

function init(): void | false {
	const pullRequests = select.all('[data-hovercard-type="pull_request"]');
	if (pullRequests.length === 0) {
		return false;
	}

	delegate(document, '.rgh-deep-reblame', 'click', redirectToBlameCommit);
	for (const pullRequest of pullRequests) {
		const hunk = pullRequest.closest('.blame-hunk')!;

		const reblameLink = select('.reblame-link', hunk)!;
		if (reblameLink) {
			reblameLink.setAttribute('aria-label', 'View blame prior to this change. Hold `Alt` to extract commits from this PR first');
			reblameLink.classList.add('rgh-deep-reblame');
		} else {
			select('.blob-reblame', hunk)!.append(
				<button
					type="button"
					aria-label="View blame prior to this change (extracts commits from this PR first)"
					className="reblame-link btn-link no-underline tooltipped tooltipped-e d-inline-block pr-1 rgh-deep-reblame"
				>
					{versionIcon()}
				</button>
			);
		}
	}
}

features.add({
	id: __featureName__,
	description: 'When exploring blames, `Alt`-clicking the “Reblame” buttons will extract the associated PR’s commits first, instead of treating the commit a single change.',
	screenshot: 'https://user-images.githubusercontent.com/16872793/77248541-8e3f2180-6c10-11ea-91d4-221ccc0ecebb.png'
}, {
	include: [
		features.isBlame
	],
	init
});
