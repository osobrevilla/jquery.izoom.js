var IZoom = (function($, doc) {

    var m = Math,
        dummyStyle = doc.createElement('div').style,
        vendor = (function() {
            var vendors = 't,webkitT,MozT,msT,OT'.split(','),
                t,
                i = 0,
                l = vendors.length;

            for (; i < l; i++) {
                t = vendors[i] + 'ransform';
                if (t in dummyStyle) {
                    return vendors[i].substr(0, vendors[i].length - 1);
                }
            }

            return false;
        })(),
        cssVendor = vendor ? '-' + vendor.toLowerCase() + '-' : '',

        // Style properties
        transform = prefixStyle('transform'),
        backfaceVisibility = prefixStyle('backfaceVisibility'),
        perspective = prefixStyle('perspective'),
        transitionProperty = prefixStyle('transitionProperty'),
        transitionDuration = prefixStyle('transitionDuration'),
        transformOrigin = prefixStyle('transformOrigin'),
        transitionTimingFunction = prefixStyle('transitionTimingFunction'),
        transitionDelay = prefixStyle('transitionDelay'),
        userSelect = prefixStyle('userSelect'),

        // Browser capabilities
        isAndroid = (/android/gi).test(navigator.appVersion),
        isIDevice = (/iphone|ipad/gi).test(navigator.appVersion),
        isTouchPad = (/hp-tablet/gi).test(navigator.appVersion),

        has3d = prefixStyle('perspective') in dummyStyle,
        hasTouch = 'ontouchstart' in window && !isTouchPad,
        hasTransform = vendor !== false,
        hasTransitionEnd = prefixStyle('transition') in dummyStyle,

        RESIZE_EV = 'onorientationchange' in window ? 'orientationchange' : 'resize',
        START_EV = hasTouch ? 'touchstart' : 'mousedown',
        MOVE_EV = hasTouch ? 'touchmove' : 'mousemove',
        END_EV = hasTouch ? 'touchend' : 'mouseup',
        CANCEL_EV = hasTouch ? 'touchcancel' : 'mouseup',
        TRNEND_EV = (function() {
            if (vendor === false) return false;

            var transitionEnd = {
                '': 'transitionend',
                'webkit': 'webkitTransitionEnd',
                'Moz': 'transitionend',
                'O': 'otransitionend',
                'ms': 'MSTransitionEnd'
            };

            return transitionEnd[vendor];
        })(),

        nextFrame = (function() {
            return window.requestAnimationFrame ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame ||
                window.oRequestAnimationFrame ||
                window.msRequestAnimationFrame ||
                function(callback) {
                    return setTimeout(callback, 1);
                };
        })(),
        cancelFrame = (function() {
            return window.cancelRequestAnimationFrame ||
                window.webkitCancelAnimationFrame ||
                window.webkitCancelRequestAnimationFrame ||
                window.mozCancelRequestAnimationFrame ||
                window.oCancelRequestAnimationFrame ||
                window.msCancelRequestAnimationFrame ||
                clearTimeout;
        })(),

        // Helpers
        translateZ = has3d ? ' translateZ(0)' : '';

    function IZoom(wrapper, options) {

        var that = this;

        that.wrapper = $(wrapper).css({
            'position': 'absolute',
            'overflow': 'hidden',
            'text-align': 'left',
            '-moz-user-select': 'none',
            '-khtml-user-select': 'none',
            '-webkit-user-select': 'none',
            'user-select': 'none',                  
            '-webkit-touch-callout': 'none',
            '-ms-touch-action': 'none'
        });
        
        that.options = $.extend({
            width: 300,
            height: 700,
            zoom: true,
            handleClick: true,
            zoomMin: 1,
            zoomMax: 6,
            zoomInit: 1,
            speedZoom: .5,
            doubleTapZoom: 3
        }, options);

        that.el = that.wrapper.children().first().css({
            'position': 'absolute',
            'z-index': 1,
            'left': '0px',
            'top': '0px'
        }).css(transformOrigin, '0 0').css(backfaceVisibility, 'hidden').css(perspective, 1000);

        if (that.el.get(0) instanceof Image) 
            that.el.attr('galleryimg', 'no');

        that.oX = 0;
        that.oY = 0;
        that.tX = 0;
        that.tY = 0;
        that._zMin = 0;
        that._zMax = 0;
        that.scale = 1;
        that.rTime = null;
        that.zoomed = false;
        that.animating = false;
        that.enabled = true;
        that.wheelZoomCount = 0;
        that.doubleTapTimer = null;
        that._iW = that.options.width;
        that._iH = that.options.height;
        that._wW = that.wrapper.width();
        that._wH = that.wrapper.height();
        that.offset = that.wrapper.offset();
        that.wrapperOffsetLeft = that.offset.left;
        that.wrapperOffsetTop = that.offset.top;
        that.scale = that.oScale = that.getRatioSize(that._wW, that._wH, that._iW, that._iH);
        that._zMin = that.scale * that.options.zoomMin;
        that._zMax = that.scale * that.options.zoomMax;
        that._zIni = that.scale * that.options.zoomInit;
        that.w = that.scale * that._iW;
        that.h = that.scale * that._iH;
        that.x = that.oX = (that._wW - that.scale * that._iW) / 2;
        that.y = that.oY = (that._wH - that.scale * that._iH) / 2;
        that._pos(that.x, that.y);
        that._on(RESIZE_EV, window);
        that._on(START_EV);
        that._on('DOMMouseScroll');
        that._on('mousewheel');
    };

    $.extend(IZoom.prototype, {

        getRatioSize: function(wW, wH, targetWidth, targetHeight) {
            return (wH / wW) > (targetHeight / targetWidth) ? wW / targetWidth : wH / targetHeight;
        },

        handleEvent: function(je) {
            var that = this,
                e = je.originalEvent;

            switch (e.type) {
                case START_EV:
                    if (!hasTouch && e.button !== 0) return;
                    that._start(e);
                    break;
                case MOVE_EV:
                    that._move(e);
                    break;
                case END_EV:
                case CANCEL_EV:
                    that._end(e);
                    break;
                case RESIZE_EV:
                    that._resize();
                    break;
                case 'DOMMouseScroll':
                case 'mousewheel':
                    that._wheel(e);
                    break;
                case TRNEND_EV:
                    that._transitionEnd(e);
                    break;
            }
        },

        _transitionTime: function(time) {
            time += 'ms';
            this.el.css(transitionDuration, time);
        },

        _on: function(type, el, bubble) {
            $(el || this.wrapper).on(type, $.proxy(this.handleEvent, this));
        },

        _off: function(type, el, bubble) {
            $(el || this.wrapper).off(type, $.proxy(this.handleEvent, this));
        },

        disable: function() {
            this.enabled = false;
            this._off(MOVE_EV, window);
            this._off(END_EV, window);
            this._off(CANCEL_EV, window);
        },

        enable: function() {
            this.enabled = true;
        },

        _getDistance: function(x1, y1, x2, y2) {
            return Math.sqrt(Math.abs(((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1))));
        },

        _resize: function() {
            var that = this;
            clearTimeout(that.rTime);
            that.rTime = setTimeout(function() {

                that._wW = that.wrapper.width();
                that._wH = that.wrapper.height();
                that.offset = that.wrapper.offset();
                that.wrapperOffsetLeft = that.offset.left;
                that.wrapperOffsetTop = that.offset.top;
                that.scale = that.oScale = that.getRatioSize(that._wW, that._wH, that._iW, that._iH);
                that._zMin = that.scale * that.options.zoomMin;
                that._zMax = that.scale * that.options.zoomMax;

                that.w = that.scale * that._iW;
                that.h = that.scale * that._iH;
                that.x = that.oX = (that._wW - that.scale * that._iW) / 2;
                that.y = that.oY = (that._wH - that.scale * that._iH) / 2;
                that._pos(that.x, that.y, that.scale);

            }, isAndroid ? 200 : 0);
        },

        _start: function(e) {
            var that = this,
                point = hasTouch ? e.touches[0] : e,
                c1, c2;

            if (!that.enabled) return;

            e.preventDefault();
            that._transitionTime(0);
            that.zoomed = false;
            that.moved = false;

            if (hasTouch && e.touches.length > 1) {
                that.touchesDistStart = that._getDistance(e.touches[0].pageX, e.touches[0].pageY, e.touches[1].pageX, e.touches[1].pageY);
                that._scale = that.scale;
                if (that.options.onZoomStart) that.options.onZoomStart.call(that, e);
            }

            that.startX = that.x;
            that.startY = that.y;
            that.pointX = point.pageX;
            that.pointY = point.pageY;
            that.startTime = e.timeStamp || Date.now();
            that._on(MOVE_EV, window);
            that._on(END_EV, window);
            that._on(CANCEL_EV, window);
        },
        _move: function(e) {
            var that = this,
                point = hasTouch ? e.touches[0] : e,
                deltaX = point.pageX - that.pointX,
                deltaY = point.pageY - that.pointY,
                newX = that.x + deltaX,
                newY = that.y + deltaY,
                limitX = that._wW - that.w,
                limitY = that._wH - that.h,
                newW,
                newH,
                c1, c2,
                scale,
                minScrollY = 0,
                pixTol = .5,
                timestamp = e.timeStamp || Date.now();

            if (hasTouch && e.touches.length > 1) {

                that._centx = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                that._centy = (e.touches[0].pageY + e.touches[1].pageY) / 2;
                that.touchesDist = that._getDistance(e.touches[0].pageX, e.touches[0].pageY, e.touches[1].pageX, e.touches[1].pageY);
                that.focusOffX = that._centx - that.wrapperOffsetLeft - (that._wW / 2);
                that.focusOffY = that._centy - that.wrapperOffsetTop - (that._wH / 2);
                that.changeOffset(true, true);
                that.zoomed = true;

                scale = that._scale * (that.touchesDist / that.touchesDistStart); //1 / that.touchesDistStart * that.touchesDist * that.scale;

                if (scale < that._zMin) scale = 0.5 * that._zMin * Math.pow(2.0, scale / that._zMin);
                else if (scale > that._zMax) scale = 2.0 * that._zMax * Math.pow(0.5, that._zMax / scale);

                that.scale += (scale - that.scale) / 1;

                that.w = that.scale * that._iW;
                that.h = that.scale * that._iH;

                that.limitX = (((that.w - that._wW) / (that.w / that._wW)) / 2);
                that.limitY = (((that.h - that._wH) / (that.h / that._wH)) / 2);

                if (that.oX < -that.limitX - that.focusOffX) {
                    that.oX = -that.limitX - that.focusOffX;
                }
                if (that.oX > that.limitX - that.focusOffX) {
                    that.oX = that.limitX - that.focusOffX;
                }
                if (that.w < that._wW) {
                    that.tX = (that._wW - that.w) / 2;
                    that.changeOffset(true, false);
                }

                if (that.oY < -that.limitY - that.focusOffY) {
                    that.oY = -that.limitY - that.focusOffY;
                }
                if (that.oY > that.limitY - that.focusOffY) {
                    that.oY = that.limitY - that.focusOffY;
                }

                if (that.h < that._wH) {
                    that.tY = (that._wH - that.h) / 2;
                    that.changeOffset(false, true);
                }

                newX = ((that._wW - that.w) / 2) + that.focusOffX + (that.oX * (that.w / that._wW));
                newY = ((that._wH - that.h) / 2) + that.focusOffY + (that.oY * (that.h / that._wH));

                that._trans(newX, newY, that.scale);

                if (that.options.onZoom) 
                    that.options.onZoom.call(that, e);
                return;
            }

            that.pointX = point.pageX;
            that.pointY = point.pageY;

            if (that.w > that._wW) {
                newX = newX > 0 ? 0 : newX < limitX ? limitX : newX;
            } else {
                newX -= deltaX;
            }

            if (that.h > that._wH) {
                newY = newY > 0 ? 0 : newY < limitY ? limitY : newY;
            } else {
                newY -= deltaY;
            }

            that.tX = newX;
            that.tY = newY;
            that.changeOffset(true, true);
            that._pos(newX, newY);
            that.moved = true;
            if (that.options.onMove) 
                that.options.onMove.call(that, e);
        },
        _end: function(e) {

            if (hasTouch && e.touches.length !== 0) return;
            var that = this,
                point = hasTouch ? e.changedTouches[0] : e,
                duration = (e.timeStamp || Date.now()) - that.startTime,
                x, y, limitX, limitY,
                scale, target;

            that._off(MOVE_EV, window);
            that._off(END_EV, window);
            that._off(CANCEL_EV, window);

            if (that.zoomed) {

                that.scale = Math.max(that._zMin, that.scale);
                that.scale = Math.min(that._zMax, that.scale);

                that.w = that.scale * that._iW;
                that.h = that.scale * that._iH;

                that.limitX = (((that.w - that._wW) / (that.w / that._wW)) / 2);
                that.limitY = (((that.h - that._wH) / (that.h / that._wH)) / 2);

                if (that.oX < -that.limitX - that.focusOffX) {
                    that.oX = -that.limitX - that.focusOffX;
                }
                if (that.oX > that.limitX - that.focusOffX) {
                    that.oX = that.limitX - that.focusOffX;
                }
                if (that.w < that._wW) {
                    that.tX = (that._wW - that.w) / 2;
                    that.changeOffset(true, false);
                }

                if (that.oY < -that.limitY - that.focusOffY) {
                    that.oY = -that.limitY - that.focusOffY;
                }
                if (that.oY > that.limitY - that.focusOffY) {
                    that.oY = that.limitY - that.focusOffY;
                }

                if (that.h < that._wH) {
                    that.tY = (that._wH - that.h) / 2;
                    that.changeOffset(false, true);
                }

                that.tX = ((that._wW - that.w) / 2) + that.focusOffX + (that.oX * (that.w / that._wW));
                that.tY = ((that._wH - that.h) / 2) + that.focusOffY + (that.oY * (that.h / that._wH));

                that.x = that.tX;
                that.y = that.tY;

                that._transitionTime(200);
                //that.el.css(transform, 'translate(' + that.x.toFixed(14) + 'px,' + that.y.toFixed(14) + 'px) scale(' + that.scale + ')' + translateZ);
                that._pos(that.x, that.y);
                that.zoomed = false;
                if (that.options.onZoomEnd) that.options.onZoomEnd.call(that, e);
                return;
            }

            if (!that.moved) {
                if (hasTouch) {

                    if (that.doubleTapTimer && that.options.zoom) {
                        // Double tapped
                        clearTimeout(that.doubleTapTimer);
                        that.doubleTapTimer = null;
                        if (that.options.onZoomStart) that.options.onZoomStart.call(that, e);

                        that.zoom(that.pointX, that.pointY, that.scale == that.oScale ? that.options.doubleTapZoom : that.oScale);
                        if (that.options.onZoomEnd) {
                            setTimeout(function() {
                                that.options.onZoomEnd.call(that, e);
                            }, 200); // 200 is default zoom duration
                        }
                    } else if (that.options.handleClick) {
                        that.doubleTapTimer = setTimeout(function() {
                            that.doubleTapTimer = null;

                            // Find the last touched element
                            target = point.target;
                            while (target.nodeType != 1) target = target.parentNode;

                            if (target.tagName != 'SELECT' && target.tagName != 'INPUT' && target.tagName != 'TEXTAREA') {
                                ev = doc.createEvent('MouseEvents');
                                ev.initMouseEvent('click', true, true, e.view, 1,
                                    point.screenX, point.screenY, point.clientX, point.clientY,
                                    e.ctrlKey, e.altKey, e.shiftKey, e.metaKey,
                                    0, null);
                                ev._fake = true;
                                target.dispatchEvent(ev);
                            }
                        }, that.options.zoom ? 250 : 0);
                    }
                }
            }

            if (that.options.onTouchEnd) that.options.onTouchEnd.call(that, e);
        },

        changeOffset: function(x, y) {
            if (x) this.oX = (this.tX - ((this._wW - this.w) / 2) - this.focusOffX) / (this.w / this._wW);
            if (y) this.oY = (this.tY - ((this._wH - this.h) / 2) - this.focusOffY) / (this.h / this._wH);
        },

        _transitionEnd: function(e) {
            if (e.target != this.el[0]) return;
            this._off(TRNEND_EV);

            this._startAni();
        },

        _startAni: function() {

        },

        _wheel: function(e) {
            var that = this,
                wheelDeltaX, wheelDeltaY,
                deltaX, deltaY,
                deltaScale;
            // if (e.target != that.wrapper[0])
            //     return;

            if ('wheelDeltaX' in e) {
                wheelDeltaX = e.wheelDeltaX / 5;
                wheelDeltaY = e.wheelDeltaY / 5;
            } else if ('wheelDelta' in e) {
                wheelDeltaX = wheelDeltaY = e.wheelDelta / 5;
            } else if ('detail' in e) {
                wheelDeltaX = wheelDeltaY = -e.detail * 3;
            } else {
                return;
            }

            deltaScale = that.scale * Math.pow(2, 1 / 3 * (wheelDeltaY ? wheelDeltaY / Math.abs(wheelDeltaY) : 0));
            if (deltaScale < that._zMin) deltaScale = that._zMin;
            if (deltaScale > that._zMax) deltaScale = that._zMax;

            if (deltaScale != that.scale) {
                if (!that.wheelZoomCount && that.options.onZoomStart) that.options.onZoomStart.call(that, e);
                that.wheelZoomCount++;

                that.zoom(e.pageX, e.pageY, deltaScale, 400);

                setTimeout(function() {
                    that.wheelZoomCount--;
                    if (!that.wheelZoomCount && that.options.onZoomEnd) that.options.onZoomEnd.call(that, e);
                }, 400);
            }
        },

        _pos: function(x, y) {
            
            var that = this,
                limitX = that._wW - that.w,
                limitY = that._wH - that.h,
                newX = x > 0 ? (that._wW - that.scale * that._iW) / 2 : x < limitX ? limitX : x,
                newY = y > 0 ? (that._wH - that.scale * that._iH) / 2 : y < limitY ? limitY : y;
            that._trans(newX, newY, that.scale);
        },

        _trans: function(x, y, scale){
            var that = this;
            
            if (hasTransform) {
                that.el.css(transform, 'translate(' + x.toFixed(14) + 'px,' + y.toFixed(14) + 'px) scale(' + scale + ')' + translateZ);
            } else {
                that.el.css({
                    left: x,
                    top: y,
                    width: that.w,
                    height: that.h
                });
            }
            that.x = that.tX = x;
            that.y = that.tY = y;
        },

        zoom: function(x, y, scale, time) {

            var that = this,
                relScale = scale / that.scale;
            that.zoomed = true;
            that.scale = scale;
            time = time === undefined ? 400 : time;
            x = x - that.wrapperOffsetLeft * scale - that.x;
            y = y - that.wrapperOffsetTop * scale - that.y;
            that.x = x - x * relScale + that.x;
            that.y = y - y * relScale + that.y;
            that._transitionTime(time);
            that.w = that.scale * that._iW;
            that.h = that.scale * that._iH;
            that._pos(that.x, that.y);
            that.zoomed = false;
        }
    });

    $.extend({
        IZoom: function(options) {
            return this.each(function() {
                var wrapper = $(this);
                if (!wrapper.data('IZoom'))
                    wrapper.data('IZoom', new IZoom(wrapper, options));
            });
        }
    });

    function prefixStyle(style) {
        if (vendor === '') return style;

        style = style.charAt(0).toUpperCase() + style.substr(1);
        return vendor + style;
    }

    dummyStyle = null; // for the sake of it

    return IZoom;
}(window.jQuery, window.document))