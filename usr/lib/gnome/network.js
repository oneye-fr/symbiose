var item = $('<li></li>');

var label = $('<a href="#"></a>').appendTo(item);

var icon = $('<img />', { 'class': 'icon', src: new SIcon('status/network-idle', 24, 'ubuntu-mono-dark'), title: 'Aucune activité réseau' }).appendTo(label);

var menu = $('<ul></ul>').appendTo(item);
var menuTotal = $('<li></li>').appendTo(menu);
var menuPending = $('<li></li>').appendTo(menu);
var menuFailed = $('<li></li>').appendTo(menu);

new SIndicator(item);

var networkData = {
	total: W.ServerCall.getNbrPendingCalls(),
	pending: W.ServerCall.getNbrPendingCalls(),
	failed: 0
};

var refreshMenuFn = function() {
	menuTotal.html('Requ&ecirc;tes envoy&eacute;es : '+networkData.total);
	menuPending.html('Requ&ecirc;tes en cours de chargement : '+networkData.pending);
	menuFailed.html('Requ&ecirc;tes &eacute;chou&eacute;es : '+networkData.failed);
};

var serverCallStart = function(data) {
	icon
		.attr('src', new SIcon('status/network-transmit-receive', 24, 'ubuntu-mono-dark'))
		.attr('title', 'Chargement de cours...');
};
W.ServerCall.bind('start', serverCallStart);
if (W.ServerCall.getNbrPendingCalls() > 0) {
	serverCallStart();
}
W.ServerCall.bind('stop', function() {
	icon
		.attr('src', new SIcon('status/network-idle', 24, 'ubuntu-mono-dark'))
		.attr('title', 'Aucune activité réseau');
});

W.ServerCall.bind('register', function() {
	networkData.total++;
	networkData.pending++;
	refreshMenuFn();
});
W.ServerCall.bind('complete', function(data) {
	networkData.pending--;
	if (!data.call.response.isSuccess()) {
		networkData.failed++;
	}
	refreshMenuFn();
});

refreshMenuFn();