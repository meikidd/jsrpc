
(function( exports, global, undefined ){

	// Check if exports has been defined.
	if ( exports == 'defined' || !global.io ) {
		return !global.io && function(){ throw new Error('Easy comet requires socket.io'); };
	}

	// Utils
	var utils = {
		uuid : (function(){
			var i = 0;
			return function(){
				return ++i;
			};
		})()
	};

	// Protocol vertion
	exports.jsrpcVertion   = '1.0';
	// Sockets map
	exports.sockets = {};
	
	// Connect to socket server
	exports.connect = function( url ){
		return this.sockets[ url ] || ( this.sockets[ url ] = new Socket( url ) );
	};

	// Socket Connection Class
	function Socket( url ){

		this.server = url;
		// Add instance
		this.instances[ url ] = this;
		// Properties - Service Map
		this.serviceMap = {};
		// Properties - Client Methods
		this.clientMethods = {};
		// Properties - Client Method Called Listeners
		this.onClientMethInvedMap = {};
		// Properties - Infos & Callbacks of Invoking Server Method
		this.invokeInfoMap = {};
		this.invokeCallbackMap = {};

		// Connect
		this._connect();
	};

	// Socket instance map
	Socket.prototype.instances = {
		// URL : instance
	};

	// * TODO
	// Socket instance map
	Socket.prototype.disconnect = function(  ){

	};

	// Get Service Object
	Socket.prototype.getService = function( serviceName, callback ){ 
		var staleService = this.serviceMap[ serviceName ];
		if ( staleService && callback ) {
			if ( staleService._loading  ) {
				staleService._callbacks.push( callback );
			}
			else {
				callback( staleService );
			}
		}
		else {
			this.serviceMap[ serviceName ] = {
				_socket      : this,
				_serviceName : serviceName,
				_loading     : true,
				_callbacks   : callback ? [callback] : []
			};
			this.ioSocket.emit( io.JSON.stringify({
				'action'    : 'query_method',
				'interface' : serviceName,
				'id'        : utils.uuid(),
				'jsrpc'     : easyComet.jsrpcVertion
			}) );
		}
	};

	// Register Client Method
	Socket.prototype.register = function( methodName, paramTypes, func ){
		this.clientMethods[ methodName ] = func;
		// Check methodName like "interface.methodName"
		var nameSplit = methodName.split('.');
		if ( nameSplit.length != 2 ) {
			throw new Error('Register params like: "interface.methodName", [ "Param Types" ], Function.');
		}
		this.ioSocket.emit( io.JSON.stringify({
			'action'     : 'register_method',
			'interface'  : nameSplit[0],
			'methodName' : nameSplit[1],
			'paramTypes' : paramTypes,
			'id'         : utils.uuid(),
			'jsrpc'      : easyComet.jsrpcVertion
		}) );
	};

	// Invoke Server Method
	Socket.prototype.invoke = function( methodName, params, callback ){
		// Param Check: name, callback
		if ( typeof params == 'function' && !callback ) {
			callback = params;
			params = undefined;
		}
		// Check methodName like "interface.methodName"
		var nameSplit = methodName.split('.');
		if ( nameSplit.length != 2 ) {
			throw new Error('Invoke params like: "interface.methodName".');
		}
		// Invoke Info
		var invokeInfo = {
			'action'          : 'invoke',
			'interface'       : nameSplit[0], // TO DO
			'methodName' 			: nameSplit[1],
			'params'          : params,
			'id'              : utils.uuid(),
			'jsrpc'           : easyComet.jsrpcVertion
		};
		// Cache
		this.invokeInfoMap[ invokeInfo.id ] = invokeInfo;
		this.invokeCallbackMap[ invokeInfo.id ] = callback;
		// Emit
		this.ioSocket.emit( io.JSON.stringify( invokeInfo ) );
	};

	// TODO
	// Add listener for Client Method
	Socket.prototype.on = function( methodName, func ){
		var list = this.onClientMethInvedMap[ methodName ];
		if ( !list ) {
			list = this.onClientMethInvedMap[ methodName ] = {};
		}
		list[ func ] = func;
	};

	// _ Do connect
	Socket.prototype._connect = function(){
		var socket = this;
		this.ioSocket = io.connect( this.server );
		this.ioSocket.on('easycomet-server2client', function( info ){

			switch ( info.action ){
				// Invoke Client Method
				case 'invoke':
					var result = socket._invokeClientMethod( info );
					socket._sendBackClientMethodResult( result, info );
					break;

				// Register Client Method
				case 'result_register':
					break;

				// Result callback of invoking Server Method
				case 'result_invoke':
					socket._receiveInvokeResult( info );
					// "error":{"code":0,"message":"IllegalArgumentException."},
					break;

				// Result callback of querying method list of Service
				case 'result_query_method':
					socket._setupMethodsForService( info );
					break;
				//
				default: 
			}
		});
	};

	// _ Set up methods for service
	Socket.prototype._setupMethodsForService = function( resultInfo ){
		// TODO
		var serviceInfo = this.serviceMap[ resultInfo.interface ];
		var methodList = resultInfo.result;
		var callbacks = serviceInfo._callbacks;
		for (var i = methodList.length - 1; i >= 0; i--) {
			var method = methodList[i];
			serviceInfo[ method.method ] = new Function(
				method.paramTypes.join(','),
				'this._socket.invoke( this._serviceName + ".' + method.method + '", [ ' + method.paramTypes.join(',') + ' ], arguments[arguments.length-1]);'
			);
		}
		delete serviceInfo._loading;
		delete serviceInfo._callbacks;

		for (var i = callbacks.length - 1; i >= 0; i--) {
			callbacks[i]( serviceInfo );
		}
	};

	// _ Invoke Client Method and return result
	Socket.prototype._invokeClientMethod = function( methodInfo ){
		var result;
		// TODO 同名方法注册
		// var methodList = typeof methodInfo.method == 'string' ? this.localMethodCallMap[ methodInfo.method ] : null;

		// for ( var methodName in methodList ) {
		// 	var method = methodList[ methodName ];
		// 	if ( typeof method == 'function' ) {
		// 		method( methodInfo.params );
		// 	}
		// }

		var method = typeof methodInfo.method == 'string' ? this.clientMethods[ methodInfo.interface + '.' + methodInfo.method ] : null;
		if ( typeof method == 'function' ) {
			result = method( methodInfo.params );
		}

		return result;
	};

	// _ Send back the result of Client Method
	Socket.prototype._sendBackClientMethodResult = function( result, methodInfo ){
		this.ioSocket.emit( io.JSON.stringify({
			'action' : 'result_invoke',
			'result' : result,
			'id'     : methodInfo.id,
			'status' : true, // TODO
			// "status":"false","error": {"code": -32601, "message": "Procedure not found."} // TODO
			'jsrpc'  : easyComet.jsrpcVertion
		}) );
	};

	// _ Receive the result after Server Method to be invoked
	Socket.prototype._receiveInvokeResult = function( resultInfo ){
		var invokeInfo = this.invokeInfoMap[ resultInfo.id ];
		var invokeCallback = this.invokeCallbackMap[ resultInfo.id ];
		if ( typeof invokeCallback == 'function' ) {
			invokeCallback( resultInfo.result );
		}
		// Release cache
		delete this.invokeInfoMap[ resultInfo.id ];
		delete this.invokeCallbackMap[ resultInfo.id ];
	};

})(
	typeof this.easyComet === 'object' ? 'defined' : (this.easyComet = {}),
	this
);