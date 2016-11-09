/**
 * Copyright (c) 2016 Uncharted Software Inc.
 * http://www.uncharted.software/
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

'use strict';

var $ = require('jquery');
var template = require('../templates/readerview.handlebars');
var defaults = require('./thumbnails.defaults.js');
var Outline = require('@uncharted/strippets').Outline;
var Keyboard = require('@uncharted/stories.common').Keyboard;
var Thumbnail = require('./thumbnails.thumbnail');
var mediator = require('@uncharted/stories.common').mediator;

function Readerview(spec) {
    var t = this;
    t.$scrollView = spec.$scrollView;
    t.thumbnailItems = [];
    t.iconMap = [];
    t._config = $.extend({}, defaults.config.readerview, spec.config);
    t.$element = undefined;
    t.$currentReaderHolder = undefined;
    t.outline = undefined;
    t.highlights = undefined;
    t._init();
}

Readerview.prototype._init = function() {
    var t = this;

    t.$element = $(template());
    t._$readerContainer = t.$element.find(defaults.classes.readerview.readerContainer);
    t._$buttonContainer = t.$element.find(defaults.classes.readerview.buttonContainer);
    t._$nextButton = t.$element.find(defaults.classes.readerview.readerNextButton);
    t._$prevButton = t.$element.find(defaults.classes.readerview.readerPrevButton);

    t._$readerContainer.width(t._config.readerWidth);
    t._$buttonContainer.width(t._config.readerWidth);
    t._registerEvents();
};

Readerview.prototype._registerEvents = function() {
    var t = this;
    var keyboard = new Keyboard(t.$element);
    keyboard.bindKeydown(function(key) {
        var LEFT_ARROW_KEY = 37;
        var RIGHT_ARROW_KEY = 39;
        if (key === LEFT_ARROW_KEY) {
            t._navigate(-1);
        }
        if (key === RIGHT_ARROW_KEY) {
            t._navigate(1);
        }
    });
    t.$element.on('click', function(event) {
        if (event.target === t.$element[0]) {
            return t.close();
        }
        return null;
    });
    t._$nextButton.on('click', function() {
        t._navigate(1);
    });
    t._$prevButton.on('click', function() {
        t._navigate(-1);
    });
};

Readerview.prototype._getParentScale = function ($child) {
    var $parent = $child.parent();
    if ($parent && $parent[0] !== document) {
        var transform = $parent.css('transform');
        if (transform !== 'none') {
            var values = transform.split('(')[1].split(')')[0].split(',');
            var a = Number(values[0]);
            var b = Number(values[1]);
            return Math.sqrt(a * a + b * b);
        }

        return Readerview.prototype._getParentScale($parent);
    }
    return 1;
};

/*
 * Place the reader right next to the last element of the same row in which provided thumbnail is placed in.
 */
Readerview.prototype.placeReader = function (thumbnailId, stayOpened) {
    var t = this;
    var $previousPlaceHolder = t.$currentReaderHolder;
    var wasOpen = $previousPlaceHolder && $previousPlaceHolder.hasClass('open');
    var clickedThumbnail = _.find(t.thumbnailItems, function(thumbnail) {
        return thumbnail.data.id === thumbnailId;
    });
    var clickedThumbnailPosition = clickedThumbnail._$element.position();
    var visibleThumbnailsInSameRow = t.thumbnailItems.filter(function(item) {
        var isInSameRow = item._$element.position().top === clickedThumbnailPosition.top;
        return item._$element.is(':visible') && isInSameRow;
    });
    var lastVisibleThumbnailInRow = _.find(visibleThumbnailsInSameRow, function(item) {
        var $nextItems = item._$element.nextAll('.thumbnail:visible');
        return $nextItems.length > 0
            ? $($nextItems[0]).position().top !== clickedThumbnailPosition.top
            : true;
    });
    // check if the lastVisibleThumbnailInRow is in the last row (no visible thumbnails are next to it)
    var $nextItems = lastVisibleThumbnailInRow._$element.nextAll('.thumbnail:visible:first, .dummyThumbnail:last');
    var $targetElement = $($nextItems[0]).hasClass('dummyThumbnail')
        ? $($nextItems[0])
        : lastVisibleThumbnailInRow._$element;

    if (stayOpened) {
        // remove all previously created reader holders except the current one
        t.$currentReaderHolder.siblings('.reader-holder').remove();
    } else {
        t.$currentReaderHolder = $targetElement.next('.reader-holder').length === 0
            ? $('<div class="reader-holder"></div>')
            : $targetElement.next('.reader-holder');
        t.$currentReaderHolder.append(t.$element);

        if ($previousPlaceHolder && (t.$currentReaderHolder[0] !== $previousPlaceHolder[0])) {
            $previousPlaceHolder.removeClass('open');
            $previousPlaceHolder.height(0);
        }
    }
    $targetElement.after(t.$currentReaderHolder);

    // scroll to the reader
    var $scrollTo = lastVisibleThumbnailInRow._$element;
    var scale = 1 / t._getParentScale(clickedThumbnail._$element);
    if (lastVisibleThumbnailInRow) {
        var $container = t.$scrollView;
        var thumbsPerRow = 0;
        var top = t.thumbnailItems[0]._$element.position().top;
        var count = 0;
        _.each(t.thumbnailItems, function (thumbnailItem) {
            var $thumb = thumbnailItem._$element;
            if ($thumb.is(':visible')) {
                thumbnailItem.index = count;
                if (!thumbsPerRow && $thumb.position().top !== top) {
                    thumbsPerRow = count;
                }
                count++;
            }
        });

        var thumbnailIndex = lastVisibleThumbnailInRow.index - thumbsPerRow + 1;
        var currentTop = t.$currentReaderHolder.position().top;
        var previousTop = $previousPlaceHolder ? $previousPlaceHolder.position().top : currentTop;
        if (!wasOpen || previousTop !== currentTop || !$previousPlaceHolder || stayOpened) {
            // Top of the row containing the target thumbnail
            var thumbnailHeight = $scrollTo.height();
            var rowCount = Math.ceil(thumbnailIndex / thumbsPerRow);
            var scrollTop = thumbnailHeight * rowCount;
            var leftoverReaderHeight = Math.max(0, (thumbnailHeight + t._config.readerHeight) - $container.height());
            // try to bring the reader into view
            scrollTop = scrollTop + leftoverReaderHeight;
            var onComplete = function () {
                mediator.publish(t.outline.events.outline.RedrawEntity);
            };
            if (stayOpened) {
                $container.scrollTop(scrollTop);
                onComplete();
            } else {
                $container.animate({scrollTop: scrollTop}, {
                    duration: t._config.openAnimationMs,
                    complete: onComplete,
                });
            }
        }
    }
    var marker = t.$element.find('.marker');
    marker.css('left', Math.floor((scale * clickedThumbnail._$element.position().left) + (clickedThumbnail._$element.width() * 0.5) - 5));
};

Readerview.prototype._navigate = function(offset) {
    var t = this;

    var visibleThumbnails = t.thumbnailItems.filter(function(item) {
        return item._$element.is(':visible');
    });
    var currentThumbnailIndex = _.findIndex(visibleThumbnails, function(item) {
        return item.data.id === t._currentLoadedThumbnailData.id;
    });

    var toIndex = (currentThumbnailIndex + offset) > 0 ? currentThumbnailIndex + offset : 0;

    if (toIndex >= 0 && toIndex < visibleThumbnails.length && currentThumbnailIndex !== toIndex) {
        t.navigateTo(visibleThumbnails[toIndex]);
    }
};

Readerview.prototype.navigateTo = function(to) {
    var t = this;
    var thumbnail = undefined;
    if (to instanceof Thumbnail) {
        thumbnail = to;
    } else if (to.data) {
        // if to has a data object
        thumbnail = to;
    } else {
        thumbnail = _.find(t.thumbnailItems, function(item) {
            return item.data.id === to;
        });
    }
    if (thumbnail) {
        t.placeReader(thumbnail.data.id, true);
        t.loadOutline(thumbnail.data);
        t.$element.focus();
    }
};

/*
 * open the reader for given thumbnail
 */
Readerview.prototype.open = function(thumbnailData) {
    if (thumbnailData) {
        var t = this;
        t.placeReader(thumbnailData.id);
        t.loadOutline(thumbnailData);

        // force it to calculate the height before it starts to animate the reader height properly
        t.$currentReaderHolder.height(t._config.readerHeight);
        t.$currentReaderHolder.addClass('open');
        t.$element.focus();
    }
};

Readerview.prototype.close = function() {
    var t = this;

    if (t.$currentReaderHolder) {
        t.$currentReaderHolder.removeClass('open');
        t.$currentReaderHolder.height(0);
    }
    if (t.outline) {
        return t.outline.closeReadingMode();
    }
    return null;
};

Readerview.prototype.updateThumbnailItems = function(thumbnailItems, iconMap) {
    this.thumbnailItems = thumbnailItems;
    this.iconMap = iconMap;
};

Readerview.prototype.getOutlineConfig = function() {
    var t = this;
    var entityBarWidth = t._config.entityBarWidth;
    return {
        reader: {
            enabled: true,
            readerWidth: t._config.readerWidth - entityBarWidth,
            onLoadUrl: function(url) {
                return Promise.resolve(t._config.onLoadUrl(url)).then(function(result) {
                    if (result) {
                        t.outline.$outlineContainer.addClass('outline-loaded');
                    } else {
                        // There's a bit of a race condition; we might not have data at this point,
                        // because the user could have selected an article that then got filtered out of existence.
                        // To prevent the template dereferencing undefined, close the reader.
                        return t.close();
                    }
                    return result;
                });
            },
            onReaderOpened: t._config.onReaderOpened,
            onReaderClosed: t._config.onReaderClosed,
        },
        maincontent: {
            minimizedWidth: entityBarWidth,
        },
    };
};

Readerview.prototype.loadOutline = function(data) {
    var t = this;
    t._$readerContainer.html('');
    t._currentLoadedThumbnailData = data;

    // initialize with Animations Disabled
    $.Velocity.mock = true;
    t.outline = new Outline(t._$readerContainer, data, t.iconMap, t.getOutlineConfig(), 'readingmode', t.highlights);
};

Readerview.prototype.highlight = function(highlightedEntities) {
    var t = this;
    t.highlights = highlightedEntities;
    if (t.outline) {
        t.outline.feature.highlight(t.highlights);
    }
};

module.exports = Readerview;