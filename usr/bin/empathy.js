Webos.require([
	'/usr/lib/strophejs/strophe.js',
	'/usr/lib/strophejs/strophe.vcard.js',
	'/usr/lib/strophejs/strophe.chatstates.js',
	'/usr/lib/webos/data.js'
], function() {
	Webos.xmpp = {
		config: {
			//boshHttpUrl: 'http://'+window.location.hostname+':5280/http-bind',
			//boshHttpUrl: 'http://bosh.metajack.im:5280/xmpp-httpbind',
			boshHttpUrl: 'https://jwchat.org/http-bind/',
			//boshHttpUrl: 'http://emersion.fr:5280/http-bind/',
			//boshWsUrl: 'ws://'+window.location.hostname+':5280'
			boshWsUrl: 'ws://emersion.fr:5280/'
		},
		initialize: function () {
			var boshUrl = this.config.boshHttpUrl;
			if (window.WebSocket && this.config.boshWsUrl) {
				boshUrl = this.config.boshWsUrl;
			}

			return new Strophe.Connection(boshUrl);
		},
		getSubJid: function (jid) {
			//for parsing JID: ramon@localhost/1234567
			//to ramon@localhost

			var index = jid.indexOf('/');
			if (index > 0) {
				return jid.slice(0, index);
			} else {
				return jid;
			}
		},
		getJidDomain: function (jid) {
			//for parsing JID: ramon@localhost/1234567
			//to localhost

			jid = this.getSubJid(jid);

			var index = jid.indexOf('@');
			if (index > 0) {
				return jid.slice(index + 1);
			} else {
				return jid;
			}
		},
		getJidUsername: function (jid) {
			//for parsing JID: ramon@localhost/1234567
			//to ramon

			jid = this.getSubJid(jid);

			var index = jid.indexOf('@');
			if (index > 0) {
				return jid.slice(0, index);
			} else {
				return jid;
			}
		}
	};

	var Empathy = function () {
		Webos.Observable.call(this);

		this.initialize();
	};

	Empathy._services = {
		facebook: {
			type: 'xmpp',
			title: 'Facebook',
			options: {
				host: 'chat.facebook.com'
			}
		},
		google: {
			type: 'xmpp',
			title: 'Google',
			options: {
				host: 'gmail.com'
			}
		},
		xmpp: {
			type: 'xmpp',
			title: 'XMPP'
		}
	};
	Empathy.service = function (serviceName) {
		return this._services[serviceName];
	};
	Empathy.listServices = function () {
		return this._services;
	};

	Empathy.createConnection = function (serviceName, options) {
		var serviceApiName = serviceName[0].toUpperCase() + serviceName.substr(1),
			serviceApi = this[serviceApiName];

		if (!serviceApi) {
			return false;
		}

		return serviceApi.create(options);
	};

	Empathy.prototype = {
		_$win: $(),
		_$settingsWin: $(),
		_$conversations: {},
		_conns: [],
		_loggedInUsers: {},
		_contacts: {},
		_defaultContactIcon: new W.Icon('stock/person').realpath(32),
		_currentDst: null,
		_servers: {
			'chat.facebook.com': 'Facebook',
			'gmail.com': 'Google',
			'': 'XMPP'
		},
		_config: {
			accounts: [],
			sendComposing: true,
			sendActive: false
		},
		_conn: function (index) {
			return this._conns[index];
		},
		connection: function (index) {
			return this._conn(index);
		},
		connectionByUsername: function (username) {
			for (var i = 0; i < this._conns.length; i++) {
				var conn = this._conns[i];

				if (conn.option('username') == username) {
					return conn;
				}
			}
		},
		countConnections: function () {
			return this._conns.length;
		},
		contacts: function () {
			return this._contacts;
		},
		contact: function (username) {
			return this._contacts[username];
		},
		loggedInUser: function (username) {
			return this._loggedInUsers[username];
		},
		currentDst: function () {
			return this._currentDst;
		},
		initialize: function () {
			var that = this;

			W.xtag.loadUI('/usr/share/templates/empathy/main.html', function(windows) {
				that._$win = $(windows).filter(':eq(0)');
				that._$settingsWin = $(windows).filter(':eq(1)');

				var $win = that._$win;

				$win.window('open');

				$win.window('loading', true);
				that._loadConfig().on('complete', function (data) {
					$win.window('loading', false);

					that._autoConnect();
				});

				that._initUi();
				that._initEvents();
				that.switchView('login');
			});
		},
		_initUi: function () {
			var that = this;
			var $win = this._$win;

			var services = Empathy.listServices();

			var $services = $win.find('.view-login .login-service');
			for (var serviceName in services) {
				var service = services[serviceName];

				$services.append('<option value="'+serviceName+'">'+service.title+'</option>');
			}
		},
		_initEvents: function () {
			var that = this;
			var $win = this._$win;

			$win.find('.view-login form').submit(function (e) {
				e.preventDefault();

				var serviceName = $win.find('.view-login .login-service').val(),
					username = $win.find('.view-login .login-username').val(),
					password = $win.find('.view-login .login-password').val();

				if (!username) {
					return;
				}

				that.connect({
					username: username,
					password: password,
					service: serviceName
				});
			});

			this.on('connecting', function (data) {
				$win.window('loading', true, {
					message: 'Logging in '+data.connection.option('username'),
					lock: (that.countConnections() == 1)
				});

				var connId = data.id;
				this.once('connected connecterror autherror', function (data) {
					if (data.id == connId) {
						$win.window('loading', false);
					}
				});
			});

			this.on('disconnecting', function (data) {
				$win.window('loading', true, {
					message: 'Disconnecting '+data.connection.option('username'),
					lock: (that.countConnections() <= 1)
				});

				var connId = data.id;
				this.once('disconnected', function (data) {
					if (data.id == connId) {
						$win.window('loading', false);
					}

					if (!that.countConnections()) {
						that.switchView('login');
					}
				});
			});

			this.once('connected', function () {
				that.switchView('conversations');

				$win.find('.search-entry').searchEntry('option', 'disabled', false);
			});

			$win.find('.search-entry').keyup(function () {
				var searchQuery = $win.find('.search-entry').searchEntry('value');

				that.searchContacts(searchQuery);
			});

			var $contactsCtn = $win.find('.view-conversations .friends-list ul'),
				$conversationCtn = $win.find('.conversation ul');
			this.on('contactupdated', function (contact) {
				var $contact = $contactsCtn.children('li').filter(function () {
					return ($(this).data('username') == contact.username);
				});
				if (!$contact.length) {
					$contact = $('<li></li>').data('username', contact.username).appendTo($contactsCtn);
					$contact.append('<span class="contact-status"></span>');
					$contact.append('<img alt="" class="contact-picture"/>');
					$contact.append('<span class="contact-name"></span>');
					$contact.append('<span class="contact-server"></span>');
				}

				var readablePresence = '';
				switch (contact.presence) { // See http://www.xmpp.org/rfcs/rfc3921.html#rfc.section.2.2.2.1
					case 'online': // actively interested in chatting
						readablePresence = 'Available';
						break;
					case 'away': // temporarily away
						readablePresence = 'Away';
						break;
					case 'dnd': // busy (dnd = "Do Not Disturb")
						readablePresence = 'Busy';
						break;
					case 'xa': // away for an extended period (xa = "eXtended Away")
						readablePresence = 'Not available';
						break;
				}

				var inserted = false;
				$contact.detach();
				$contactsCtn.children('li').each(function () {
					var thisContact = that.contact($(this).data('username'));

					if ($(this).is('.contact-conversation-unread') && !$contact.is('.contact-conversation-unread')) {
						return;
					}
					if (thisContact.priority < contact.priority) {
						$(this).before($contact);
						inserted = true;
						return false;
					}
				});
				if (!inserted) {
					$contactsCtn.append($contact);
				}

				$contact.removeClass('contact-online contact-offline contact-away').addClass('contact-'+contact.presence);

				$contact.find('.contact-name').text(contact.name);
				$contact.find('.contact-status').html('<span class="status-inner">'+readablePresence+'</span>');
				$contact.find('.contact-picture').attr('src', contact.picture);

				if (typeof contact.conn != 'undefined') {
					var conn = that._conn(contact.conn);

					if (conn.option('service')) {
						var service = Empathy.service(conn.option('service'));

						$contact.find('.contact-server').text(service.title);
					}
				}

				$contactsCtn.toggleClass('hide-contact-server', (that.countConnections() <= 1));
			});

			this.on('userupdated', function (contact) {
				$win.find('.conversation-compose .compose-contact-picture').attr('src', contact.picture);
			});

			var scrollToConversationBottom = function () {
				var conversationHeight = 0;
				$conversationCtn.children().each(function () {
					conversationHeight += $(this).outerHeight(true);
				});

				$conversationCtn.scrollTop(conversationHeight);
			};
			this.on('messagesent', function (msg) {
				var dst = that.contact(msg.to), src = that.loggedInUser(msg.from);

				var $msg = $('<li></li>', { 'class': 'msg msg-sent' });
				$msg.append('<img src="'+src.picture+'" alt="" class="msg-contact-picture">');
				$msg.append($('<span></span>', { 'class': 'msg-content' }).html(msg.message));

				if (that.currentDst() && that.currentDst().username == msg.to) {
					$msg.appendTo($conversationCtn);
					scrollToConversationBottom();
				} else {
					var $msgs = $();
					if (that._isConversationDetached(msg.to)) {
						$msgs = that._$conversations[msg.to];
					}
					that._$conversations[msg.to] = $msgs.add($msg);
				}
			});
			this.on('messagereceived', function (msg) {
				var src = that.contact(msg.from), dst = that.loggedInUser(msg.to);

				var $msg = $('<li></li>', { 'class': 'msg msg-received' });
				$msg.append('<img src="'+src.picture+'" alt="" class="msg-contact-picture">');
				$msg.append($('<span></span>', { 'class': 'msg-content' }).html(msg.message));

				if (that.currentDst() && that.currentDst().username == msg.from) {
					$conversationCtn.find('.msg-typing').remove();
					$msg.appendTo($conversationCtn);
					scrollToConversationBottom();
				} else {
					var $msgs = $();
					if (that._isConversationDetached(msg.from)) {
						$msgs = that._$conversations[msg.from];
					}
					that._$conversations[msg.from] = $msgs.not('.msg-typing').add($msg);

					//Set conversation as unread
					var $contact = $contactsCtn.children('li').filter(function () {
						return ($(this).data('username') == msg.from);
					});
					$contact.addClass('contact-conversation-unread').detach().prependTo($contactsCtn);

					//Show a little notification
					var $replyEntry = $('<input />', { type: 'text', placeholder: 'Reply...' })
						.css({ 'float': 'left' })
						.keydown(function (e) {
							if (e.keyCode == 13) {
								var msg = {
									from: src.conn,
									to: src.username,
									message: $replyEntry.val()
								};
								that.sendMessage(msg);

								$replyEntry.val('');
							}
						});
					var $talkBtn = $.w.button('Talk').click(function() {
						that._switchConversation(src.username, src.conn);
					});

					$.w.notification({
						title: 'New message from '+src.name,
						icon: 'apps/chat',
						message: msg.message,
						widgets: [$replyEntry, $talkBtn]
					});
				}
			});

			this.on('contactcomposing', function (data) {
				var src = that.contact(data.username);

				var $msg = $('<li></li>', { 'class': 'msg msg-received msg-typing' });
				$msg.append('<img src="'+src.picture+'" alt="" class="msg-contact-picture">');
				$msg.append($('<span></span>', { 'class': 'msg-content' }).html('...'));

				if (that.currentDst() && that.currentDst().username == data.username) {
					if (!$conversationCtn.find('.msg-typing').length) {
						$msg.appendTo($conversationCtn);
						scrollToConversationBottom();
					}
				} else {
					var $msgs = $();
					if (that._isConversationDetached(data.username)) {
						$msgs = that._$conversations[data.username];
					}

					if (!$msgs.filter('.msg-typing').length) {
						that._$conversations[data.username] = $msgs.add($msg);
					}
				}
			});

			this.on('contactpaused', function (data) {
				var src = that.contact(data.username);

				if (that.currentDst() && that.currentDst().username == data.username) {
					$conversationCtn.find('.msg-typing').remove();
				} else {
					if (that._isConversationDetached(data.username)) {
						that._$conversations[data.username] = $msgs.not('.msg-typing');
					}
				}
			});

			/*!
			 * True if the user is composing a message, false otherwise.
			 * @type {Boolean}
			 */
			var isComposing = false;
			var sendActive = function (dstUsername) {
				if (!that._config.sendActive) {
					return;
				}

				var dst = that.contact(dstUsername), conn = that.connection(dst.conn);

				conn.sendChatstate({
					to: dst.username,
					type: 'active'
				});
			};
			var sendComposing = function (dstUsername) {
				if (!that._config.sendComposing) {
					return;
				}

				if (!isComposing) {
					var dst = that.contact(dstUsername), conn = that.connection(dst.conn);

					conn.sendChatstate({
						to: dst.username,
						type: 'composing'
					});
					isComposing = true;
				}
			};
			var sendPaused = function (dstUsername) {
				if (isComposing) {
					var dst = that.contact(dstUsername), conn = that.connection(dst.conn);

					conn.sendChatstate({
						to: dst.username,
						type: 'paused'
					});
					isComposing = false;
				}
			};

			$contactsCtn.on('click', 'li', function () {
				var previousDst = that.currentDst();
				if (previousDst) {
					sendPaused(previousDst.username);
				}

				var $contact = $(this),
					contactUsername = $contact.data('username'),
					contact = that.contact(contactUsername);

				if (!contact || typeof contact.conn == 'undefined') {
					return;
				}

				that._switchConversation(contact.username, contact.conn);
				sendActive(contact.username);

				that._getContactPicture(contact.conn, contact.username);
			});

			$win.find('.conversation-compose .compose-msg').keydown(function (e) {
				var dst = that.currentDst(),
					msgContent = $(this).val();

				if (!dst) {
					return;
				}

				if (msgContent) {
					sendComposing(dst.username);
				} else {
					sendPaused(dst.username);
				}

				if (e.keyCode == 13) { //Enter
					sendPaused(dst.username);

					if (!msgContent) {
						return;
					}

					var msg = {
						connId: dst.conn,
						to: dst.username,
						message: msgContent
					};
					that.sendMessage(msg);

					$(this).val('').focus();
				}
			});

			$win.find('.btn-accounts').click(function () {
				that.openSettings();
			});

			$win.on('windowclose', function () {
				that.disconnect();
			});

			this.on('accountupdate accountremove', function () {
				that._saveConfig();
			});
		},
		switchView: function (newView) {
			var $views = this._$win.find('.views > div'),
				$newView = $views.filter('.view-'+newView);

			$views.hide();
			$newView.show();
		},
		connect: function (options) {
			var that = this;

			options = $.extend({
				username: '',
				password: '',
				service: ''
			}, options);

			if (!options.username) {
				return false;
			}

			var service = Empathy.service(options.service);

			if (!service) {
				return false;
			}

			var connectOptions = $.extend({}, options);

			if (service.options) {
				if (service.options.host) {
					if (connectOptions.username.indexOf('@') == -1) {
						connectOptions.username += '@'+service.options.host;
					}
				}
			}

			var conn = Empathy.createConnection(service.type);
			if (!conn) {
				return false;
			}

			var connId = this._conns.length;
			this._conns.push(conn);

			conn.on('status', function (data) {
				switch (data.type) {
					case 'connecting':
						that.trigger('connecting', {
							connection: conn,
							id: connId
						});
						break;
					case 'connfail':
						that.trigger('connecterror', {
							connection: conn,
							id: connId
						});

						Webos.Error.trigger('Failed to connect to server with username "'+options.username+'"', '', 400);
						break;
					case 'connected':
						that._connected(connId);
						break;
					case 'disconnecting':
						that.trigger('disconnecting', {
							connection: conn,
							id: connId
						});
						break;
					case 'disconnected':
						that.trigger('disconnected', {
							connection: conn,
							id: connId
						});

						that._conns.splice(connId, 1);
						break;
					case 'authenticating':
						that.trigger('authenticating', {
							connection: conn,
							id: connId
						});
						break;
					case 'authfail':
						that.trigger('autherror', {
							connection: conn,
							id: connId
						});

						Webos.Error.trigger('Failed to authenticate with username "'+options.username+'"', '', 401);
						break;
					case 'error':
						that.trigger('connerror', {
							connection: conn,
							id: connId
						});

						Webos.Error.trigger('An error occured with connection "'+options.username+'"', '', 400);
						break;
				}
			});

			conn.connect(connectOptions);

			this._addAccount(options);
		},
		disconnect: function (connId) {
			if (typeof connId == 'undefined') {
				for (var i = 0; i < this._conns.length; i++) {
					this._conns[i].disconnect();
				}

				this._conns = [];
			} else {
				if (!this._conns[connId]) {
					return false;
				}

				this._conns[connId].disconnect();
			}
		},
		_addAccount: function (newAccount) {
			var accounts = this._config.accounts;

			newAccount.password = null; //Remove password!

			for (var i = 0; i < accounts.length; i++) {
				var account = accounts[i];

				if (account.username == newAccount.username) {
					if (account !== newAccount) {
						this._config.accounts[i] = newAccount;
						this.trigger('accountupdate', { account: newAccount });
					}

					return;
				}
			}

			this._config.accounts.push(newAccount);
			this.trigger('accountupdate', { account: newAccount });
		},
		_removeAccount: function (username) {
			var accounts = this._config.accounts;

			for (var i = 0; i < accounts.length; i++) {
				var account = accounts[i];

				if (account.username == username) {
					this._config.accounts.splice(i, 1); //Remove item
					this.trigger('accountremove', { account: account });
					return true;
				}
			}

			return false;
		},
		_loadConfig: function () {
			var that = this;
			var op = Webos.Operation.create();

			Webos.DataFile.loadUserData('empathy', [function (dataFile) {
				var config = dataFile.data();

				if (Object.keys(config).length) {
					that._config = config;
				}

				op.setCompleted();
			}, function (resp) {
				op.setCompleted(resp);
			}]);

			return op;
		},
		_saveConfig: function () {
			var that = this;

			Webos.User.getLogged(function(user) {
				if (user) { //User logged in
					Webos.DataFile.loadUserData('empathy', function (dataFile) {
						dataFile.setData(that._config);
						dataFile.sync();
					});
				}
			});
		},
		_autoConnect: function () {
			var that = this;

			if (this._config.accounts.length == 1) {
				var account = this._config.accounts[0];

				if (account.password) {
					this.connect(account);
				} else {
					this._$win.find('.view-login .login-service').val(account.service);
					
					this._$win.find('.view-login .login-username').val(account.username);
					this._$win.find('.view-login .login-password').focus();
				}
			} else {
				var accounts = this._config.accounts;
				for (var i = 0; i < accounts.length; i++) {
					(function (account) {
						if (account.password) {
							this.connect(account);
						} else {
							var service = Empathy.service(account.service);

							var $askPasswordWin = $.w.window({
								title: 'Logging in '+account.username+' to '+service.title,
								dialog: true,
								resizable: false,
								width: 350
							});

							var $form = $.w.entryContainer().appendTo($askPasswordWin.window('content'));

							$.w.label('Please enter your password for '+account.username+'.').appendTo($form);
							var $passwordEntry = $.w.passwordEntry('Password: ');
							$passwordEntry.appendTo($form);

							var $btns = $.w.buttonContainer().appendTo($form);
							var $cancelBtn = $.w.button('Cancel').click(function () {
								$askPasswordWin.window('close');
							}).appendTo($btns);
							var $submitBtn = $.w.button('Login', true).appendTo($btns);

							$form.submit(function () {
								var password = $passwordEntry.passwordEntry('value');

								if (!password) {
									return;
								}

								that.connect($.extend({}, account, {
									password: password
								}));
								$askPasswordWin.window('close');
							});

							$askPasswordWin.window('open');
						}
					})(accounts[i]);
				}
			}
		},
		_connected: function (connId) {
			var that = this, conn = this._conn(connId);

			this.trigger('connected', {
				id: connId,
				connection: conn
			});

			conn.on('messagereceived', function (msg) {
				that.trigger('messagereceived', {
					from: msg.from,
					to: msg.to,
					connId: connId,
					message: msg.body
				});
			});
			conn.on('messagesent', function (msg) {
				that.trigger('messagesent', {
					from: msg.from,
					to: msg.to,
					connId: connId,
					message: msg.body
				});
			});

			this._initChatstates(connId);

			this._listContacts(connId);
		},
		_initChatstates: function (connId) {
			var that = this, conn = this._conn(connId);

			conn.on('chatstate', function (state) {
				switch (state.type) {
					case 'active':
						that.trigger('contactactive', {
							username: state.username
						});
						break;
					case 'composing':
						that.trigger('contactcomposing', {
							username: state.username
						});
						break;
					case 'paused':
						that.trigger('contactpaused', {
							username: state.username
						});
						break;
				}
			});
		},
		_listContacts: function (connId) {
			var that = this, conn = this._conn(connId);

			//Set user info
			var connUsername = conn.option('username');
			this._loggedInUsers[connUsername] = {
				username: connUsername,
				name: 'Me'
			};
			that._getContactPicture(connId, connUsername);

			conn.on('contact', function (contact) {
				that._setContact($.extend({}, contact, {
					conn: connId
				}));

				if (contact.presence == 'online') {
					that._getContactPicture(connId, contact.username);
				}
			});

			conn.listContacts();
		},
		_setContact: function (contact) {
			var isLoggedInUser = (!!this._loggedInUsers[contact.username]),
				currentContact = (isLoggedInUser) ? this._loggedInUsers[contact.username] : this._contacts[contact.username];

			contact = $.extend({}, currentContact, {
				username: contact.username,
				conn: contact.conn,
				name: contact.name,
				presence: contact.presence,
				priority: contact.priority,
				picture: contact.picture
			});

			contact.name = contact.name || contact.username;

			contact.presence = contact.presence || 'offline';
			switch (contact.presence)  {
				case 'online':
					contact.priority = 0;
					break;
				case 'away':
					contact.priority = -8;
					break;
				case 'dnd':
					contact.priority = -4;
					break;
				case 'xa':
					contact.priority = -12;
					break;
				default:
					contact.priority = -128;
			}

			contact.picture = contact.picture || this._defaultContactIcon;

			if (isLoggedInUser) {
				this._loggedInUsers[contact.username] = contact;

				this.trigger('userupdated', contact);
			} else {
				this._contacts[contact.username] = contact;

				this.trigger('contactupdated', contact);
			}
		},
		_getContactPicture: function (connId, username) {
			var that = this, conn = this._conn(connId), contact = this.contact(username);

			if (contact && contact.picture) {
				return;
			}

			conn.getContactPicture(username);
		},
		$conversation: function () {
			return this._$win.find('.conversation ul');
		},
		_isConversationDetached: function (username) {
			return (!!this._$conversations[username]);
		},
		_detachCurrentConversation: function () {
			if (!this._currentDst) {
				return;
			}

			this._$conversations[this._currentDst.username] = this.$conversation().children().detach();
			this._currentDst = null;
		},
		_reattachConversation: function (username) {
			if (!this._isConversationDetached(username)) {
				return;
			}

			this._detachCurrentConversation();

			this._currentDst = this.contact(username);
			this.$conversation().append(this._$conversations[this._currentDst.username]);
			delete this._$conversations[this._currentDst.username];
		},
		_switchConversation: function (dst, connId) {
			var conn = this._conn(connId);

			this._detachCurrentConversation();
			this._reattachConversation(dst);
			this._currentDst = this.contact(dst);

			this._$win.find('.conversation .conversation-compose').show();
			this._$win.find('.conversation .conversation-compose .compose-msg').focus();

			var $contactsCtn = this._$win.find('.view-conversations .friends-list ul');
			var $contact = $contactsCtn.children('li').filter(function () {
				return ($(this).data('username') == dst);
			});
			$contactsCtn.children('.item-active').removeClass('item-active');
			$contact.addClass('item-active').removeClass('contact-conversation-unread');
		},
		sendMessage: function (msg) {
			var conn = this._conn(msg.connId);

			conn.sendMessage({
				to: msg.to,
				body: msg.message
			});
		},
		searchContacts: function (searchQuery) {
			var that = this;

			var searchAttrs = ['username', 'name', 'presence'];

			var $contactsCtn = this._$win.find('.view-conversations .friends-list ul');

			if (!searchQuery) {
				$contactsCtn.children().show();
			} else {
				$contactsCtn.children().each(function () {
					var contact = that.contact($(this).data('username'));

					for (var i = 0; i < searchAttrs.length; i++) {
						var val = contact[searchAttrs[i]];
						if (!~val.toLowerCase().indexOf(searchQuery.toLowerCase())) {
							$(this).hide();
						} else {
							$(this).show();
							break;
						}
					}
				});
			}
		},
		openSettings: function () {
			var that = this;

			var $settingsWin = this._$settingsWin;

			if (!$settingsWin.window('is', 'opened')) {
				$settingsWin.window('option', 'parentWindow', this._$win).window('open');

				this.on('accountupdate.settings.empathy accountremove.settings.empathy', function () {
					that.openSettings();
				});
				$settingsWin.one('windowclose', function () {
					that.off('accountupdate.settings.empathy accountremove.settings.empathy');
				});

				$settingsWin.find('.settings-close').off('click.settings.empathy').on('click.settings.empathy', function () {
					$settingsWin.window('close');
				});
			}
			$settingsWin.window('toForeground');

			// Accounts

			var $form = $settingsWin.find('form'),
				$serviceEntry = $settingsWin.find('.account-service'),
				$usernameEntry = $settingsWin.find('.account-username'),
				$passwordEntry = $settingsWin.find('.account-password'),
				$removeAccountBtn = $settingsWin.find('.acount-remove');


			var services = Empathy.listServices();
			$serviceEntry.empty();
			for (var serviceName in services) {
				var service = services[serviceName];

				$serviceEntry.append('<option value="'+serviceName+'">'+service.title+'</option>');
			}

			var editedAccount = -1;

			var $accountsList = $settingsWin.find('.accounts-list').list('content').empty();
			var accounts = this._config.accounts;
			for (var i = 0; i < accounts.length; i++) {
				(function (i, account) {
					var service = Empathy.service(account.service);

					var $item = $.w.listItem(account.username+' on '+service.title);
					$item.on('listitemselect', function () {
						editedAccount = i;

						$serviceEntry.val(account.service);
						$usernameEntry.val(account.username);
						$passwordEntry.val(account.password || '');

						$removeAccountBtn.button('option', 'disabled', false);
					});

					if (i == 0) { //Select first item
						$item.listItem('option', 'active', true);
					}

					$item.appendTo($accountsList);
				})(i, accounts[i]);
			}

			var $newItem = $.w.listItem('New account').appendTo($accountsList);
			$newItem.on('listitemselect', function () {
				editedAccount = -1;

				$serviceEntry.val('');
				$usernameEntry.val('');
				$passwordEntry.val('');

				$removeAccountBtn.button('option', 'disabled', true);
			});
			if (i == 0) { //Select first item
				$newItem.listItem('option', 'active', true);
			}

			$form.off('submit.settings.empathy').on('submit.settings.empathy', function (e) {
				e.preventDefault();

				var account = {
					service: $serviceEntry.val(),
					username: $usernameEntry.val(),
					password: $passwordEntry.val()
				};

				if (~editedAccount && that._config.accounts[editedAccount].username != account.username) {
					that._removeAccount(that._config.accounts[editedAccount].username);
				}

				var conn = that.connectionByUsername(account.username);
				if (conn) {
					conn.disconnect();
				}
				that.connect(account);
			});

			$removeAccountBtn.off('click.settings.empathy').on('click.settings.empathy', function () {
				if (editedAccount == -1) {
					return;
				}

				var username = that._config.accounts[editedAccount].username;

				var conn = that.connectionByUsername(username);
				if (conn) {
					conn.disconnect();
				}

				that._removeAccount(username);
			});

			// Other settings
			
			$settingsWin.find('.settings-composing').find('input').each(function () {
				var settingName = $(this).data('setting');

				if (!settingName) {
					return;
				}

				if (typeof that._config[settingName] != 'undefined') {
					if ($(this).is('[type=checkbox]')) {
						$(this).prop('checked', that._config[settingName]);
					} else {
						$(this).val(that._config[settingName]);
					}
				}
			});

			$settingsWin.find('.settings-composing').on('change', 'input', function () {
				var val = $(this).val(), settingName = $(this).data('setting');

				if ($(this).is('[type=checkbox]')) {
					val = $(this).prop('checked');
				}

				that._config[settingName] = val;
				that._saveConfig();
			});
		}
	};
	Webos.inherit(Empathy, Webos.Observable);

	Empathy.Interface = function (options) {
		Webos.Observable.call(this);

		options = options || {};
		this._options = options;
		this.initialize(options);
	};
	Empathy.Interface.prototype = {
		_type: '',
		options: function () {
			return this._options;
		},
		option: function (key) {
			return this._options[key];
		},
		type: function () {
			return this._type;
		},
		initialize: function (options) {},
		connect: function () {},
		listContacts: function () {},
		getContactPicture: function (username) {}
	};
	Webos.inherit(Empathy.Interface, Webos.Observable);

	Empathy.MessageInterface = function (options) {
		Empathy.Interface.call(this, options);
	};
	Empathy.MessageInterface.prototype = {
		sendMessage: function (msg) {}
	};
	Webos.inherit(Empathy.MessageInterface, Empathy.Interface);


	Empathy.Xmpp = function (options) {
		Empathy.MessageInterface.call(this, options);
	};
	Empathy.Xmpp.prototype = {
		_type: 'xmpp',
		getSubJid: Webos.xmpp.getSubJid,
		getJidDomain: Webos.xmpp.getJidDomain,
		getJidUsername: Webos.xmpp.getJidUsername,
		initialize: function (options) {
			var that = this;

			var conn = Webos.xmpp.initialize(); //Initialize a new XMPP connection

			//Connection handlers
			conn.addHandler(function (msg) {
				var to = msg.getAttribute('to');
				var from = msg.getAttribute('from');
				var type = msg.getAttribute('type');
				var elems = msg.getElementsByTagName('body');

				if (type == 'error') {
					that.trigger('messageerror', {
						from: from,
						to: to,
						body: 'An error occured! Is your account verified? Is the individual in your contacts?'
					});
					return;
				}

				if (/*type == "chat" && */ elems.length > 0) {
					var body = elems[0];

					that.trigger('message messagereceived', {
						from: from,
						to: to,
						body: Strophe.getText(body)
					});
				}

				// we must return true to keep the handler alive.
				// returning false would remove it after it finishes.
				return true;
			}, null, 'message');

			conn.addHandler(function (presence) {
				var presenceType = $(presence).attr('type'); // unavailable, subscribed, etc...
				var from = that.getSubJid($(presence).attr('from')); // the jabber_id of the contact...

				var connJid = that.getSubJid(conn.jid);

				if (presenceType != 'error') {
					if (presenceType === 'unavailable') {
						that.trigger('contact', {
							username: from,
							account: connJid,
							presence: 'offline'
						});
					} else {
						var show = $(presence).find("show").text(); // this is what gives away, dnd, etc.
						if (show === 'chat' || !show) {
							// Mark contact as online
							that.trigger('contact', {
								username: from,
								account: connJid,
								presence: 'online'
							});
						} else {
							that.trigger('contact', {
								username: from,
								account: connJid,
								presence: show
							});
						}
					}
				}

				return true;
			}, null, "presence");

			if (conn.chatstates) { // Chatstates plugin loaded
				conn.chatstates.onActive = function (jid) {
					that.trigger('chatstate', {
						type: 'active',
						username: jid
					});
				};

				conn.chatstates.onComposing = function (jid) {
					that.trigger('chatstate', {
						type: 'composing',
						username: jid
					});
				};

				conn.chatstates.onPaused = function (jid) {
					that.trigger('chatstate', {
						type: 'paused',
						username: jid
					});
				};
			}

			this._conn = conn;
		},
		connect: function (options) {
			var that = this, conn = this._conn;
			var op = Webos.Operation.create();

			options = $.extend({
				username: '',
				password: ''
			}, this.options(), options);
			this._options = options;

			conn.connect(options.username, options.password, function (status) {
				var statusData = {
					type: ''
				};

				switch (status) {
					case Strophe.Status.CONNECTING:
						statusData.type = 'connecting';
						break;
					case Strophe.Status.CONNFAIL:
						statusData.type = 'error';
						statusData.error = 'connfail';

						op.setCompleted(false);
						break;
					case Strophe.Status.CONNECTED:
						statusData.type = 'connected';

						//Send priority
						conn.send($pres().c("priority").t(String(0)));

						op.setCompleted();
						break;
					case Strophe.Status.DISCONNECTING:
						statusData.type = 'disconnecting';
						break;
					case Strophe.Status.DISCONNECTED:
						statusData.type = 'disconnected';
						break;
					case Strophe.Status.AUTHENTICATING:
						statusData.type = 'authenticating';
						break;
					case Strophe.Status.AUTHFAIL:
						statusData.type = 'error';
						statusData.error = 'autherror';
						break;
					case Strophe.Status.ERROR:
						statusData.type = 'error';
						statusData.error = 'connerror';
						break;
					default:
						console.log('Strophe: unknown connection status: '+status);
				}

				if (statusData.type) {
					that.trigger('status', statusData);
				}
			});

			return op;
		},
		disconnect: function () {
			this._conn.disconnect();
		},
		listContacts: function () {
			var that = this, conn = this._conn;
			var op = Webos.Operation.create();

			var connJid = that.getSubJid(conn.jid);

			//Get roster
			var iq = $iq({type: 'get'}).c('query', { xmlns: 'jabber:iq:roster' });

			conn.sendIQ(iq, function (iq) {
				var contacts = [];
				$(iq).find("item").each(function() {
					// if a contact is still pending subscription then do not show it in the list
					if ($(this).attr('ask')) {
						return true;
					}

					var jid = $(this).attr('jid'), name = $(this).attr('name');
					
					if (that.getSubJid(jid) == connJid) {
						return;
					}

					var contact = {
						username: that.getSubJid(jid),
						account: connJid,
						name: (jid != name) ? name : ''
					};

					that.trigger('contact', contact);
					contacts.push(contact);
				});

				op.setCompleted(contacts);
			}, function () {
				op.setCompleted(false);
			});

			return op;
		},
		getContactPicture: function (jid) {
			var that = this, conn = this._conn;
			var op = Webos.Operation.create();

			if (!conn.vcard) {
				op.setCompleted(false);
				return op;
			}

			var connJid = that.getSubJid(conn.jid);

			conn.vcard.get(function (stanza) {
				var $vCard = $(stanza).find("vCard");
				var img = $vCard.find('BINVAL').text();
				var type = $vCard.find('TYPE').text();

				if (!img || !type) {
					op.setCompleted(false);
					return;
				}

				var imgSrc = 'data:'+type+';base64,'+img;

				var contact = {
					username: that.getSubJid(jid),
					account: connJid,
					picture: imgSrc
				};

				that.trigger('contact', contact);
				op.setCompleted(contact);
			}, jid, function () {
				op.setCompleted(false);
			});

			return op;
		},
		sendMessage: function (msg) {
			var that = this, conn = this._conn;

			var reply = $msg({
				to: msg.to,
				from: conn.jid,
				type: 'chat'
			}).c("body").t(msg.body);

			conn.send(reply.tree());

			this.trigger('message messagesent', {
				from: that.getSubJid(conn.jid),
				to: msg.to,
				body: msg.body
			});
		},
		sendChatstate: function (state) {
			var that = this, conn = this._conn;
			var op = Webos.Operation.create();

			if (!conn.chatstates) {
				op.setCompleted(false);
				return op;
			}

			var method = '';
			switch (state.type) {
				case 'active':
					method = 'sendActive';
					break;
				case 'composing':
					method = 'sendComposing';
					break;
				case 'paused':
					method = 'sendPaused';
					break;
				default:
					op.setCompleted(false);
					return op;
			}

			conn.chatstates[method](state.to);

			op.setCompleted();

			return op;
		}
	};
	Webos.inherit(Empathy.Xmpp, Empathy.MessageInterface);

	Empathy.Xmpp.create = function () {
		return new Empathy.Xmpp();
	};

	Empathy.open = function () {
		return new Empathy();
	};

	window.Empathy = Empathy;

	Empathy.open();
});