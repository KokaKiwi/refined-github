import 'webext-base-css/webext-base.css';
import './options.css';
import React from 'dom-chef';
import cache from 'webext-storage-cache';
import select from 'select-dom';
import fitTextarea from 'fit-textarea';
import {applyToLink} from 'shorten-repo-url';
import * as indentTextarea from 'indent-textarea';
import {getAllOptions} from './options-storage';
import * as domFormatters from './libs/dom-formatters';

function parseDescription(description: string): DocumentFragment {
	const descriptionElement = <span>{description}</span>;
	domFormatters.linkifyIssues(descriptionElement, {
		baseUrl: 'https://github.com',
		user: 'sindresorhus',
		repository: 'refined-github'
	});
	domFormatters.linkifyURLs(descriptionElement);
	domFormatters.parseBackticks(descriptionElement);

	for (const a of select.all('a', descriptionElement)) {
		applyToLink(a);
	}

	// eslint-disable-next-line react/jsx-no-useless-fragment
	return <>{[...descriptionElement.childNodes]}</>;
}

function buildFeatureCheckbox({name, description, screenshot, disabled}: FeatureInfo): HTMLElement {
	// `undefined` disconnects it from the options
	const key = disabled ? undefined : `feature:${name}`;

	return (
		<div className={`feature feature--${disabled ? 'disabled' : 'enabled'}`} data-text={`${name} ${description}`.toLowerCase()}>
			<input type="checkbox" name={key} id={name} disabled={Boolean(disabled)}/>
			<div className="info">
				<label for={name}>
					<span className="feature-name">{name}</span>
					{' '}
					{disabled && <small>{parseDescription(`(Disabled because of ${disabled}) `)}</small>}
					<a href={`https://github.com/sindresorhus/refined-github/blob/master/source/features/${name}.tsx`}>
						source
					</a>
					{screenshot && <>, <a href={screenshot}>screenshot</a></>}
					<p className="description">{parseDescription(description)}</p>
				</label>
			</div>
		</div>
	);
}

async function init(): Promise<void> {
	// Generate list
	const container = select('.js-features')!;
	container.append(...__featuresInfo__.map(buildFeatureCheckbox));

	// Update list from saved options
	const form = select('form')!;
	const optionsByDomain = await getAllOptions();
	await optionsByDomain.get('github.com')!.syncForm(form);

	// Move disabled features first
	for (const unchecked of select.all('.feature--enabled [type=checkbox]:not(:checked)', container).reverse()) {
		// .reverse() needed to preserve alphabetical order while prepending
		container.prepend(unchecked.closest('.feature')!);
	}

	// Highlight new features
	const {featuresAlreadySeen} = await browser.storage.local.get({featuresAlreadySeen: {}});
	const isFirstVisit = Object.keys(featuresAlreadySeen).length === 0;
	const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);

	for (const feature of select.all('.feature [type=checkbox]')) {
		if (!(feature.id in featuresAlreadySeen)) {
			featuresAlreadySeen[feature.id] = isFirstVisit ? tenDaysAgo : Date.now();
		}

		if (featuresAlreadySeen[feature.id] > tenDaysAgo) {
			feature.parentElement!.classList.add('feature-new');
		}
	}

	browser.storage.local.set({featuresAlreadySeen});

	// Improve textareas editing
	fitTextarea.watch('textarea');
	indentTextarea.watch('textarea');

	// Filter feature options
	const filterField = select<HTMLInputElement>('#filter-features')!;
	filterField.addEventListener('input', () => {
		const keywords = filterField.value.toLowerCase()
			.replace(/\W/g, ' ')
			.split(/\s+/)
			.filter(Boolean); // Ignore empty strings
		for (const feature of select.all('.feature')) {
			feature.hidden = !keywords.every(word => feature.dataset.text!.includes(word));
		}
	});

	const button = select<HTMLButtonElement>('#clear-cache')!;
	button.addEventListener('click', async () => {
		await cache.clear();
		const initialText = button.textContent;
		button.textContent = 'Cache cleared!';
		button.disabled = true;
		setTimeout(() => {
			button.textContent = initialText;
			button.disabled = false;
		}, 2000);
	});

	// GitHub Enterprise domain picker
	if (optionsByDomain.size > 1) {
		const dropdown = (
			<select>
				{[...optionsByDomain.keys()].map(domain => <option value={domain}>{domain}</option>)}
			</select>
		) as unknown as HTMLSelectElement;
		form.before(<p>Domain selector: {dropdown}</p>, <hr/>);
		dropdown.addEventListener('change', () => {
			for (const [domain, options] of optionsByDomain) {
				if (dropdown.value === domain) {
					options.syncForm(form);
				} else {
					options.stopSyncForm();
				}
			}

			select<HTMLAnchorElement>('#personal-token-link')!.host = dropdown.value;
		});
	}
}

init();
