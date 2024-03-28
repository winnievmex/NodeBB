'use strict';

const nconf = require('nconf');

const db = require('../../database');
const user = require('../../user');
const topics = require('../../topics');

const pagination = require('../../pagination');
const helpers = require('../helpers');

const categories = require('../../categories');
const privileges = require('../../privileges');
const translator = require('../../translator');
const meta = require('../../meta');

const controller = module.exports;

controller.list = async function (req, res) {
	const { topicsPerPage } = await user.getSettings(req.uid);
	const page = parseInt(req.query.page, 10) || 1;
	const start = Math.max(0, (page - 1) * topicsPerPage);
	const stop = start + topicsPerPage - 1;

	const sets = ['cid:-1:tids', `uid:${req.uid}:inbox`];
	if (req.params.filter === 'all' || !req.uid) {
		sets.pop();
	} else if (req.params.filter) {
		return helpers.redirect(res, '/world', false);
	}

	const tids = await db.getSortedSetRevIntersect({
		sets,
		start,
		stop,
		weights: sets.map((s, index) => (index ? 0 : 1)),
	});

	const [categoryFields, userPrivileges, rssToken] = await Promise.all([
		categories.getCategoryFields(-1, ['name', 'description', 'icon', 'imageClass', 'color', 'bgColor']),
		privileges.categories.get(-1, req.uid),
		user.auth.getFeedToken(req.uid),
	]);
	const data = categoryFields;
	data.cid = -1;
	data.topicCount = await db.sortedSetIntersectCard(sets);
	data.topics = await topics.getTopicsByTids(tids, { uid: req.uid });
	topics.calculateTopicIndices(data.topics, start);

	data.title = translator.escape(categoryFields.name);
	data.privileges = userPrivileges;

	data.breadcrumbs = helpers.buildBreadcrumbs([{ text: `[[pages:world]]` }]);
	data['feeds:disableRSS'] = meta.config['feeds:disableRSS'] || 0;
	data['reputation:disabled'] = meta.config['reputation:disabled'];
	if (!meta.config['feeds:disableRSS']) {
		data.rssFeedUrl = `${nconf.get('url')}/category/${data.cid}.rss`;
		if (req.loggedIn) {
			data.rssFeedUrl += `?uid=${req.uid}&token=${rssToken}`;
		}
	}

	const pageCount = Math.max(1, Math.ceil(data.topicCount / topicsPerPage));
	data.pagination = pagination.create(page, pageCount, req.query);
	helpers.addLinkTags({
		url: 'world',
		res: req.res,
		tags: data.pagination.rel,
		page: page,
	});

	res.render('world', data);
};
