/**
 *  Autocomplete for jQuery, version 1.10.X
 *  (c) 2013 Lloyd Watkin
 *
 * Heavily modified from http://www.devbridge.com/projects/autocomplete/jquery/
 */
(function($) {

  function Autocomplete(el, options) {
    this.regEx = new RegExp(
      '(\\' + ['/', '.', '*', '+', '?', '|', '(', ')', '[', ']', '{', '}', '\\']
          .join('|\\') + ')',
      'g'
  )
    this.el = $(el)
    this.el.attr('autocomplete', 'off')
    this.suggestions = []
    this.data = []
    this.badQueries = []
    this.selectedIndex = -1
    this.currentValue = this.el.val()
    this.intervalId = 0
    this.cachedResponse = []
    this.onChangeInterval = null
    this.ignoreValueChange = false
    this.serviceUrl = options.serviceUrl
    this.isLocal = false
    this.options = {
      autoSubmit: false,
      minChars: 1,
      maxHeight: 300,
      deferRequestBy: 0,
      width: 300,
      highlight: true,
      params: {},
      dataKey: null,
      formatResult: this.formatResult,
      delimiter: ' ',
      zIndex: 9999,
      searchPrefix: '',
      searchEverywhere: false,
      appendChars: ' ',
    }
    this.initialize()
    this.setOptions(options)
    return this
  }
  
  $.fn.autocomplete = function(options) {
    return new Autocomplete(this.get(0) || $('<input />'), options)
  }

  Autocomplete.prototype = {

    killerFn: null,

    initialize: function() {

      var self = this
      var uid = Math.floor(Math.random() * 0x100000).toString(16)
      var autocompleteElementId = 'Autocomplete_' + uid

      this.killerFn = function(e) {
        if (0 === $(e.target).parents('.autocomplete').size()) {
          self.killSuggestions()
          self.disableKillerFn()
        }
      }

      if (!this.options.width) this.options.width = this.el.width()
      this.mainContainerId = 'AutocompleteContainter_' + uid

      $('<div id="' + this.mainContainerId +
        '" style="position:absolute;z-index:9999;">' +
        '<div class="autocomplete-w1"><div class="autocomplete" id="' +
        autocompleteElementId + '" style="display:none; width:300px;"></div></div></div>')
        .appendTo('body')

      this.container = $('#' + autocompleteElementId)
      this.fixPosition()
      if (window.opera)
        this.el.keypress(function(e) { self.onKeyPress(e) })
      else
        this.el.keydown(function(e) { self.onKeyPress(e) })

      this.el.keyup(function(e) { self.onKeyUp(e) })
      this.el.blur(function() { self.enableKillerFn() })
      this.el.focus(function() { self.fixPosition() })
    },
    
    template: function(suggestion, data) {
      return this.options.formatResult(suggestion, data, this)
    },
    
    setOptions: function(options) {
      var o = this.options
      $.extend(o, options)
      
      if (o.lookup) this.setLookup(o.lookup)
      $('#' + this.mainContainerId).css({ zIndex: o.zIndex })
      this.container.css({ maxHeight: o.maxHeight + 'px', width: o.width })
    },
    
    setLookup: function(lookup) {
        this.isLocal = true
        if ($.isArray(lookup) || $.isObject(lookup))
            this.options.lookup = { suggestions: lookup, data: [] }
    },
    
    clearCache: function() {
      this.cachedResponse = []
      this.badQueries = []
    },
    
    disable: function() {
      this.disabled = true
    },
    
    enable: function() {
      this.disabled = false
    },
      
    fixPosition: function() {
      var offset = this.el.offset()
      $('#' + this.mainContainerId).css({
          top: (offset.top + this.el.innerHeight()) + 'px',
          left: offset.left + 'px'
      })
    },

    enableKillerFn: function() {
      var self = this
      $(document).bind('click', self.killerFn)
    },

    disableKillerFn: function() {
      var self = this
      $(document).unbind('click', self.killerFn)
    },

    killSuggestions: function() {
      var self = this
      this.stopKillSuggestions()
      this.intervalId = window.setInterval(function() {
          self.hide()
          self.stopKillSuggestions()
      }, 300)
    },

    stopKillSuggestions: function() {
      window.clearInterval(this.intervalId)
    },

    onKeyPress: function(e) {
      if (this.disabled || !this.enabled) return

      switch (e.keyCode) {
        case 27: // ESC:
          this.el.val(this.currentValue)
          this.hide()
          break
        case 9:  // TAB
        case 13: // RETURN:
          if (-1 === this.selectedIndex)
            return this.hide()
          this.select(this.selectedIndex)
          if (9 === e.keyCode) return
          break
        case 38: // UP:
          this.moveUp()
          break
        case 40: // DOWN:
          this.moveDown()
          break
        default:
          return
      }
      e.stopImmediatePropagation()
      e.preventDefault()
    },

    onKeyUp: function(e) {
      if (this.disabled) return
      switch (e.keyCode) {
        case 38: // UP:
        case 40: // DOWN:
          return
      }
      clearInterval(this.onChangeInterval)
      var self = this
      if (this.currentValue !== this.el.val()) {
        if (this.options.deferRequestBy > 0)
          this.onChangeInterval = setInterval(
              function() { self.onValueChange() },
              this.options.deferRequestBy
          )
        else
          this.onValueChange()
      }
    },

    onValueChange: function() {
      clearInterval(this.onChangeInterval)
      this.currentValue = this.el.val()
      var q = this.getQuery(this.currentValue)
      this.selectedIndex = -1
      if (this.ignoreValueChange) {
        this.ignoreValueChange = false
        return
      }
      if (('' === q) || (q.length < this.options.minChars))
        this.hide()
      else
        this.getSuggestions(q)
    },

    getQuery: function(val) {
      var prefixLength = this.options.searchPrefix.length
      var d = this.options.delimiter
      if (!d) { return $.trim(val) }
      var arr = val.split(d)
      var query = $.trim(arr[arr.length - 1])
      if (query.substring(0, prefixLength) == this.options.searchPrefix)
         return query.substring(this.options.searchPrefix.length)
      return ''
    },

    getSuggestionsLocal: function(q) {
      var arr = this.options.lookup.suggestions
      var ret = { suggestions: [], data: [] }
      q       = q.toLowerCase()

      for (var index in arr) {
        var val = arr[index]
        if ('object' === typeof(val))
          val = val[this.options.searchKey]
        var indexPosition = val.toLowerCase().indexOf(q)
        var addData = false
        if ((true === this.options.searchEverywhere) && (indexPosition > -1))
          addData = true
        else if (0 === indexPosition)
          addData = true
        if (true === addData) {
          ret.suggestions.push(val)
          ret.data.push(arr[index])
        }
      }
      return ret
    },
    
    getSuggestions: function(q) {
      var self = this
      var cached = this.isLocal ? this.getSuggestionsLocal(q) : this.cachedResponse[q]
      if (cached && ($.isArray(cached.suggestions) || $.isObject(cached.suggestions))) {
        this.suggestions = cached.suggestions
        this.data = cached.data
        this.suggest()
      } else if (!this.isBadQuery(q)) {
        this.options.params.query = q
        $.get(this.serviceUrl, this.options.params, function(txt) {
            self.processResponse(txt)
        }, 'text')
      }
    },

    isBadQuery: function(q) {
      var i = this.badQueries.length
      while (i--) {
        if (0 === q.indexOf(this.badQueries[i])) return true
      }
      return false
    },

    hide: function() {
      this.enabled = false
      this.selectedIndex = -1
      this.container.hide()
    },

    suggest: function() {
      if (0 === this.suggestions.length)
        return this.hide()
        
      var div, s
      var self = this
      var len = this.suggestions.length
      var v = this.getQuery(this.currentValue)
      var mOver = function(xi) { return function() { self.activate(xi) } }
      var mClick = function(xi) { return function() { self.select(xi) } }
      this.container.hide().empty()
      for (var i = 0; i < len; i++) {
        s = this.suggestions[i]
        if ((typeof(entry) === 'object') &&
            (typeof(this.options.dataKey) !== 'undefined'))
            s = this.data[i][this.options.dataKey]
        div = $((self.selectedIndex === i ?
            '<div class="selected"' : '<div') + ' title="' + s + '">' +
            this.template(v, this.data[i]) + '</div>'
        )
        div.mouseover(mOver(i))
        div.click(mClick(i))
        this.container.append(div)
      }
      this.enabled = true
      this.container.show()
    },

    processResponse: function(text) {
      var response
      try {
        response = JSON.parse(text)
      } catch (err) {
        return
      }
      if (!$.isArray(response.data)) response.data = []
      if (!this.options.noCache) {
        this.cachedResponse[response.query] = response
        if (0 === response.suggestions.length)
            this.badQueries.push(response.query)
      }
      if (response.query === this.getQuery(this.currentValue)) {
        this.suggestions = response.suggestions
        this.data = response.data
        this.suggest()
      }
    },

    activate: function(index) {
      var divs = this.container.children()
      // Clear previous selection:
      if ((-1 !== this.selectedIndex) && (divs.length > this.selectedIndex))
        $(divs.get(this.selectedIndex)).removeClass()

      this.selectedIndex = index
      var activeItem
      if ((-1 !== this.selectedIndex) && (divs.length > this.selectedIndex)) {
        activeItem = divs.get(this.selectedIndex)
        $(activeItem).addClass('selected')
      }
      return activeItem
    },

    deactivate: function(div, index) {
      div.className = ''
      if (this.selectedIndex === index) { this.selectedIndex = -1 }
    },

    select: function(i) {
      var selectedValue = this.suggestions[i]
      if (!selectedValue) return
      this.el.val(selectedValue)
      if (this.options.autoSubmit) {
        var f = this.el.parents('form')
        if (f.length > 0) { f.get(0).submit() }
      }
      this.ignoreValueChange = true
      this.hide()
      this.onSelect(i)
    },

    moveUp: function() {
      if (-1 === this.selectedIndex) return
      if (0 === this.selectedIndex) {
        this.container.children().get(0).className = ''
        this.selectedIndex = -1
        this.el.val(this.currentValue)
        return
      }
      this.adjustScroll(this.selectedIndex - 1)
    },

    moveDown: function() {
      if (this.selectedIndex === (this.suggestions.length - 1)) return
      this.adjustScroll(this.selectedIndex + 1)
    },

    adjustScroll: function(i) {
      var activeItem = this.activate(i)
      var offsetTop = activeItem.offsetTop
      var upperBound = this.container.scrollTop()
      var lowerBound = upperBound + this.options.maxHeight - 25
      if (offsetTop < upperBound)
        this.container.scrollTop(offsetTop)
      else if (offsetTop > lowerBound)
        this.container.scrollTop(offsetTop - this.options.maxHeight + 25)
      this.el.val(this.getValue(this.options.searchPrefix + this.suggestions[i]))
    },

    onSelect: function(i) {
      var self = this
      var fn   = this.options.onSelect
      var s    = this.suggestions[i]
      var d    = this.data[i]
      var val  = this.getValue(s)
      if ('object' === typeof(this.data[i]))
        val = this.data[i][this.options.dataKey]
      if (this.options.appendSpace) val = val + this.options.appendChars
      this.el.val(val)
      if ($.isFunction(fn)) { fn(s, d, self.el) }
    },
    
    getValue: function(value) {
        var del = this.options.delimiter
        if (!del) return value
        var currVal = this.currentValue
        var arr = currVal.split(del)
        if (1 === arr.length) return value
        var response = currVal.substr(0, currVal.length - arr[arr.length - 1].length)
        return response + value
    },
      
    /**
     * value: Data entered to autocomplete
     * data: Matching data
     */
    formatResult: function(value, data) {
      if (this.dataKey) data = data[this.dataKey]
      var pattern = '(' + value.replace(this.regEx, '\\$1') + ')'
      return data.replace(new RegExp(pattern, 'gi'), '<strong>$1<\/strong>')
    }
  }
  
})(jQuery)