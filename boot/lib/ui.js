Webos.UserInterface = function WUserInterface(data, name) {
	this._name = name;
	this._booterData = null;

	Webos.Model.call(this);

	this.hydrate(data);
};
Webos.UserInterface.prototype = {
	hydrate: function(data) {
		data = data || {};

		data.default = (data.default) ? true : false;
		data.types = String(data.types).split(',');

		return Webos.Model.prototype.hydrate.call(this, data);
	},
	name: function() {
		return this._name;
	},
	loadBooter: function(callback) {
		callback = Webos.Callback.toCallback(callback);
		var that = this;

		var createBooterFn = function(data) {
			var booter = new Webos.UserInterface.Booter(data, that.name());
			callback.success(booter);
		};

		if (this._booterData) {
			createBooterFn(this._booterData);
		} else {
			return new Webos.ServerCall({
				'class': 'UserInterfaceController',
				'method': 'loadBooter',
				'arguments': {
					ui: (this._name || false)
				}
			}).load([function(response) {
				var data = response.getData();

				that._booterData = data.booter;
				that._name = data.name;
				createBooterFn(data.booter);
			}, callback.error]);
		}
	}
};
Webos.inherit(Webos.UserInterface, Webos.Model);

Webos.Observable.build(Webos.UserInterface);

Webos.UserInterface.Booter = function WUserInterfaceBooter(data, name) {
	this._data = data;
	this._element = $();
	this._id = Webos.UserInterface.Booter._list.push(this) - 1;
	this._name = name;
	this._loaded = false;

	Webos.Observable.call(this);
};
Webos.UserInterface.Booter.prototype = {
	id: function() {
		return this._id;
	},
	name: function() {
		return this._name;
	},
	element: function() {
		return this._element;
	},
	load: function(callback) {
		callback = Webos.Callback.toCallback(callback);
		var that = this;
		this._autoLoad = true;

		this.one('loadcomplete', function() {
			callback.success();
		});

		Webos.UserInterface.Booter._current = this.id();
		this.notify('loadstart');

		var data = this._data;

		//On insere le code HTML de l'UI dans la page
		this.notify('loadstateupdate', { state: 'structure' });
		this._element = $('<div></div>', { id: 'userinterface-'+this.id() })
			.css({
				'height': '100%',
				'width': '100%',
				'position': 'absolute',
				'top': 0,
				'left': 0
			})
			.html(data.html)
			.prependTo('#userinterfaces');

		//Chargement du CSS
		this.notify('loadstateupdate', { state: 'stylesheets' });
		for (var index in data.css) {
			this.notify('loadstateupdate', { state: 'stylesheets', item: index });
			Webos.Stylesheet.insertCss(data.css[index], '#userinterface-'+this.id());
		}

		//Chargement du Javascript
		this.notify('loadstateupdate', { state: 'scripts' });
		for (var index in data.js) {
			(function(js) {
				if (!js) {
					return;
				}

				that.notify('loadstateupdate', { state: 'scripts', item: index });

				js = 'try {'+js+"\n"+'} catch(error) { Webos.Error.catchError(error); }';
				Webos.Script.run(js); //On execute le code
			})(data.js[index]);
		}
		this.notify('loadstateupdate', { state: 'scripts' });

		if (this._autoLoad) {
			this.finishLoading();
		}
	},
	disableAutoLoad: function() {
		this._autoLoad = false;
	},
	finishLoading: function() {
		if (this.loaded()) {
			return;
		}

		delete this._autoLoad;

		this.notify('loadstateupdate', { state: 'cleaning' });

		for (var i = 0; i < Webos.UserInterface.Booter._list.length; i++) {
			var booter = Webos.UserInterface.Booter._list[i];

			if (booter && booter.loaded()) {
				this.notify('loadstateupdate', { state: 'cleaning', item: booter });
				booter.unload();
			}
		}

		this._loaded = true;
		this.notify('loadcomplete');
	},
	loaded: function() {
		return this._loaded;
	},
	unload: function() {
		if (!this.loaded()) {
			return;
		}

		//Il est plus rapide de vider l'element dans un premier temps, puis de l'enlever
		this.element().empty().remove();
	}
};
Webos.inherit(Webos.UserInterface.Booter, Webos.Observable);

Webos.Observable.build(Webos.UserInterface.Booter);

Webos.UserInterface.Booter._list = [];
Webos.UserInterface.Booter._current = null;

Webos.UserInterface.Booter.current = function() {
	if (Webos.UserInterface.Booter._current === null) {
		return;
	}

	return Webos.UserInterface.Booter._list[Webos.UserInterface.Booter._current];
};

Webos.UserInterface._list = [];

Webos.UserInterface.get = function(name, data) {
	for (var i = 0; i < Webos.UserInterface._list.length; i++) {
		var ui = Webos.UserInterface._list[i];

		if (ui.get('name') == name) {
			if (data) {
				ui.hydrate(data);
			}
			return ui;
		}
	}

	var ui = new Webos.UserInterface((data || {}), name);
	Webos.UserInterface._list.push(ui);

	return ui;
};
Webos.UserInterface.current = function() {
	var booter = Webos.UserInterface.Booter.current();

	if (!booter) {
		return;
	}

	return Webos.UserInterface.get(booter.name());
};
Webos.UserInterface.load = function(name, callback) {
	callback = Webos.Callback.toCallback(callback);
	
	Webos.Error.setErrorHandler(function(error) {
		if ($('#webos-error').is(':hidden')) {
			$('#webos-error p').html('<strong>An error occured while loading user interface.</strong><br />');
			$('#webos-error').show();
		}
		
		var message;
		if (error instanceof Webos.Error) {
			message = error.html.message;
		} else {
			message = error.name + ' : ' + error.message;
		}
		
		$('#webos-error p').append(message+'<br />');
		
		if (typeof Webos.UserInterface.Booter.current() != 'undefined') {
			Webos.UserInterface.Booter.current().callLoaded = false;
		}
	});
	
	Webos.UserInterface.showLoadingScreen();

	Webos.UserInterface.setLoadingScreenText('Retrieving interface...');

	var ui = Webos.UserInterface.get(name);
	ui.loadBooter([function(booter) {
		booter.bind('loadstateupdate', function(data) {
			var msg = 'Loading interface...';
			switch (data.state) {
				case 'structure':
					msg = 'Inserting structure...';
					break;
				case 'stylesheets':
					msg = 'Applying stylesheets...';
					if (data.item) {
						msg = 'Applying stylesheet '+data.item+'...';
					}
					break;
				case 'scripts':
					msg = 'Initialising interface...';
					if (data.item) {
						msg = 'Running '+data.item+'...';
					}
					break;
				case 'cleaning':
					msg = 'Cleaning terrain...';
					break;
			}

			Webos.UserInterface.setLoadingScreenText(msg);
		});
		booter.load([function() {
			Webos.UserInterface.setLoadingScreenText('Interface loaded.');
			Webos.UserInterface.hideLoadingScreen();
		}, callback.error]);
	}, callback.error]);
};
Webos.UserInterface.getList = function(callback) {
	callback = Webos.Callback.toCallback(callback);

	return new Webos.ServerCall({
		'class': 'UserInterfaceController',
		'method': 'getList'
	}).load([function(response) {
		var data = response.getData();
		var list = [];

		for (var index in data) {
			var uiData = data[index];
			list.push(Webos.UserInterface.get(uiData.name, {
				'types': uiData.types,
				'default': uiData['default'],
				'displayname': uiData.attributes.displayname
			}));
		}

		callback.success(list);
	}, callback.error]);
};
Webos.UserInterface.setDefault = function(ui, value, callback) {
	callback = Webos.Callback.toCallback(callback);
	
	new Webos.ServerCall({
		'class': 'UserInterfaceController',
		method: 'setDefault',
		arguments: {
			ui: ui,
			value: value
		}
	}).load(new Webos.Callback(function(response) {
		callback.success();
	}, function(response) {
		callback.error(response);
	}));
};
Webos.UserInterface.setEnabled = function(ui, value, callback) {
	callback = Webos.Callback.toCallback(callback);
	
	new Webos.ServerCall({
		'class': 'UserInterfaceController',
		method: 'setEnabled',
		arguments: {
			ui: ui,
			value: value
		}
	}).load(new Webos.Callback(function(response) {
		callback.success();
	}, function(response) {
		callback.error(response);
	}));
};
Webos.UserInterface.getInstalled = function(callback) {
	callback = Webos.Callback.toCallback(callback);
	
	return new Webos.ServerCall({
		'class': 'UserInterfaceController',
		method: 'getInstalled'
	}).load([function(response) {
		var data = response.getData();
		var list = [];

		for (var index in data) {
			var uiData = data[index];
			list.push(Webos.UserInterface.get(index, uiData));
		}

		callback.success(list);
	}, callback.error]);
};
Webos.UserInterface._loadingScreenTimerId = null;
Webos.UserInterface.showLoadingScreen = function() {
	$('#webos-error p').empty();
	if (typeof Webos.UserInterface.Booter.current() == 'undefined') {
		$('#webos-loading').show();
	} else {
		if ($('#webos-loading').is(':animated')) {
			$('#webos-loading').stop().fadeTo('normal', 1);
		} else {
			$('#webos-loading').fadeIn();
		}
	}
};
Webos.UserInterface.setLoadingScreenText = function(msg) {
	$('#webos-loading p').html(msg);
};
Webos.UserInterface.hideLoadingScreen = function() {
	if ($('#webos-loading').is(':animated')) {
		$('#webos-loading').stop().fadeTo('normal', 0, function() {
			$(this).hide();
		});
	} else {
		$('#webos-loading').fadeOut();
	}
	$('#webos-error').fadeOut();
};