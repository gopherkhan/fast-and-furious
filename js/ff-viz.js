
window.NetworkGraph = function NetworkGraph(targetNode) {

  d3.selection.prototype.moveToFront = function() {
    return this.each(function(){
      this.parentNode.appendChild(this);
    });
  };
  // based off of FlowingData tutorial, here
  // http://flowingdata.com/2012/08/02/how-to-make-an-interactive-network-visualization/
  var width = 900;
  var height = 800; // get these from bounding boxes

  var margins = {
    movie: 25,
    cast: 13
  };

  var allData = [],
      curLinksData = [],
      curNodesData = [],
      linkedByIndex = {},
      // these will hold the svg groups for
      // accessing the nodes and links display
      nodesG = null,
      linksG = null,
      textsG = null,
      // these will point to the circles and lines
      // of the nodes and links
      node = null,
      link = null,
      text = null,
      // variables to refect the current settings
      // of the visualization
      layout = "force",
      filter = "all",
      sort = "movie",
      groupCenters = "null", // will store our radial layout
      force = d3.layout.force(),
      nodeColors = d3.scale.category20(),
      // tooltip = Tooltip("vis-tooltip", 230),
      // charge used in force layout
      charge = function(node) {
        return -Math.pow(node.numLinks, 2.0) / 2;
      };

  function init(data) {

    var rects = targetNode.getClientRects()[0];
    width = rects.width; //Math.min(rects.width, width);
    height = rects.height; // Math.min(rects.height, height);

    allData = setupData(data);

    // create our svg and groups
    var vis = d3.select(targetNode).append("svg")
                .attr("width", width)
                .attr("height", height);
    linksG = vis.append("g").attr("id", "links");
    nodesG = vis.append("g").attr("id", "nodes");
    textsG = vis.append("g").attr("id", "texts");

    // setup the size of the force environment
    force.size([width, height]);

    setLayout("force");
    setFilter("all");

    // perform rendering and start force layout
    update();
  }


  // Public function to switch between layouts
  function toggleLayout(newLayout) {
    force.stop();
    setLayout(newLayout);
    update();
  }

  // Public function to switch between filter options
  function toggleFilter(newFilter) {
    force.stop();
    setFilter(newFilter);
    update();
  }

  // Public function to switch between sort options
  function toggleSort(newSort) {
    force.stop();
    setSort(newSort);
    update();
  }


  // Helper function to map node id's to node objects.
  // Returns d3.map of ids -> nodes
  function mapNodes(nodes) {
    var nodesMap = d3.map()
    nodes.forEach(function (n) {
      nodesMap.set(n.id, n);
    });
    return nodesMap;
  }

  // called once to clean up raw data and switch links to
  // point to node instances
  // Returns modified data
  function setupData (data) {
    // initialize circle radius scale
    var countExtent = d3.extent(data.nodes, function(d) { return d.playcount; });
    var circleRadius = d3.scale.sqrt().range([3, 12]).domain(countExtent);

    var nodesMap = mapNodes(data.nodes);

    data.nodes.forEach(function (n) {
      // set initial x/y to values within the width/height
      // of the visualization
      n.x = Math.floor(Math.random() * width);
      n.y = Math.floor(Math.random() * height);
      // add radius to the node so we can use it later
      n.radius = circleRadius(n.playcount);

      var links = data.links.filter(function(l) {
        return l.source === n.id || l.target === n.id;
      });
      n.numLinks = links.length;
      var orders = links.map(function(l) { return nodesMap.get(l.target).order; });
      if (orders.length > 1) {
        var extent = d3.extent(orders);
        n.span = extent[1] - extent[0];
      } else {
        n.span = 1;
      }
    });

    // id's -> node objects


    // switch links to point to node objects instead of id's
    data.links.forEach(function (l) {
      l.source = nodesMap.get(l.source);
      l.target = nodesMap.get(l.target);
      // linkedByIndex is used for link sorting
      linkedByIndex[l.source.id + "," + l.target.id] = 1;
    });

    return data;
  }

  // switches force to new layout parameters
  function setLayout (newLayout) {
    layout = newLayout;
    if (layout == "force") {
      // adjust the strength of our charges
      // and the lengths of our links
      // based on how many films the character was in
      // and how many links there are to display
      force.on("tick", forceTick)
              .charge(function(d) {
                if (isMovie(d)) {
                  return -200;
                }
                return -20 * Math.max(d.numLinks, d.span);
              })
              .linkDistance(function(d) {
                if (d.type === 'chronology') {
                  return 80;
                }
                var base = Math.max(d.source.numLinks, d.source.span);
                return Math.max(base * 40, 120);
              });
    } else if (layout == "radial") {
      force.on("tick", radialTick)
              .charge(charge);
    }
  }

  function isMovie(d) {
    return d.type === 'movie' || d.type === 'short';
  }


  var lastTickTimeout;
  function forceTick(e) {
    
    if (lastTickTimeout) {
      window.clearTimeout(lastTickTimeout);
    }

    node
      .attr("cx", function (d) {
        if (isMovie(d)) {
          d.x = d.order * (width / 10);
        }
        return d.x;
      })
      .attr("cy", function (d) {
        if (isMovie(d)) {
          var fudge = d.id === 'blt' ? 60 : 0;
          d.y = (height / 2) - fudge;
        }
        return d.y;
      });

    link
      .attr("x1", function (d) { return d.source.x; })
      .attr("y1", function (d) { return d.source.y; })
      .attr("x2", function (d) { return d.target.x; })
      .attr("y2", function (d) { return d.target.y; });

    text.attr("x", function(d) {
            return d.x + getMargin(d);
          })
          .attr("y", function(d) {
            return d.y + getMargin(d);
          });

    lastTickTimeout = window.setTimeout(checkMovieLabels, 200);
  }

  function getMargin(d) {
    return isMovie(d) ? margins.movie : margins.cast;
  }

  // switches filter option to new filter
  function setFilter(newFilter) {
    filter = newFilter;
  }

  // Removes nodes from input array
  // based on current filter setting.
  // Returns array of nodes
  function filterNodes (allNodes) {
    filteredNodes = allNodes;
    if (filter == "popular" || filter == "obscure") {
      playcounts = allNodes.map(function (d) { return d.playcount; }).sort(d3.ascending);
      cutoff = d3.quantile(playcounts, 0.5);
      filteredNodes = allNodes.filter(function (n) {
        if (filter == "popular") {
          return n.playcount > cutoff;
        } else if (filter == "obscure") {
          return n.playcount <= cutoff;
        }
        return false;
      });
    }

    return filteredNodes;
  }

  // Removes links from allLinks whose
  // source or target is not present in curNodes
  // Returns array of links
  function filterLinks (allLinks, curNodes) {
    curNodes = mapNodes(curNodes);
    return allLinks.filter(function (l) {
      return curNodes.get(l.source.id) && curNodes.get(l.target.id);
    });
  }


  function updateNodes() {
    node = nodesG.selectAll("circle.node")
      .data(curNodesData, function(d) { return d.id; });

    node.enter().append("circle")
      .attr("class", function(d) { return "node " + d.type; })
      .attr("cx", function(d) {return d.x; })
      .attr("cy", function(d) { return d.y; })
      .attr('data-id', function(d) { return d.id; });
      //.attr("r", function(d) { return d.radius; })
      // .style("fill", function(d) { return nodeColors(d.artist); });
      // .style("stroke", function(d) { return strokeFor(d); })
      // .style("stroke-width", 1.0);

    node.on("mouseover", showDetails)
       .on("mouseout", hideDetails)
       .on("click", showIMDB);

    node.exit().remove();
  }

  function showIMDB(d) {
    window.open(d.url,'_blank');
  }

  function updateTexts() {
    text = textsG.selectAll("text")
      .data(curNodesData, function(d) { return d.id; });

    text.enter().append("text")
      .attr("class", function(d) { return "label hidden " + d.type; })
      .attr("data-id", function(d) { return d.id; })
      .attr("x", function(d) { return d.x + 15; })
      .attr("y", function(d) { return d.y + 15; })
      .text(function(d) { return d.name; });
  }

  function showDetails (d) {
    var textIds = [d.id];
    if (!isMovie(d)) {
      curLinksData.forEach(function (l) {
        if (l.source.id === d.id) {
          textIds.push(l.target.id);
        }
      });
    }
    // a little sloppy here, but I'll consolidate another night.
    var textIdsCss = textIds.map(function(id) { return 'text[data-id="' + id + '"]'}).join(",");
    var nodeIdsCss = textIds.map(function(id) { return 'circle[data-id="' + id + '"]'}).join(",")
    nodesG.selectAll(nodeIdsCss).classed('active', true);
    textsG.selectAll(textIdsCss).classed('hidden', false).moveToFront();
    linksG.selectAll('line[data-source="' + d.id + '"]').classed('active', true).moveToFront();
  }

  function hideDetails (d) {
    // clean this up too
    textsG.selectAll('text').classed('hidden', true);
    linksG.selectAll('line').classed('active', false);
    nodesG.selectAll('circle').classed('active', false);
  }

  // enter/exit display for links
  function updateLinks() {
    link = linksG.selectAll("line.link")
          .data(curLinksData, function(d) { return d.source.id + "_" + d.target.id; });

    link.enter().append("line")
      .attr("class", function(d) {
        return "link " + d.type;
      })
      .attr("stroke", "#ddd")
      .attr("stroke-opacity", 0.8)
      .attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; })
      .attr("data-source", function (d) { return d.source.id; });

    link.exit().remove()
  }

  function checkMovieLabels() {
    var clientRects = {};
    var filmLabelNodes = textsG.selectAll('text.movie, text.short')[0].map(function(elem) {
      //debugger;
      return {
        node: elem,
        clientRect: elem.getBoundingClientRect()
      }
    }).sort(function(a, b) {
      // we want things sorted at roughly the same vertical level
      var vertDiff = a.clientRect.top - b.clientRect.top;
      if (vertDiff !== 0) { return vertDiff; }
      return  a.clientRect.left - b.clientRect.left;
    });
    

    for (var i = 0; i < filmLabelNodes.length - 1; ++i) {
      if (isOverlap(filmLabelNodes[i].clientRect, filmLabelNodes[i + 1].clientRect)) {
        nudgeNode(filmLabelNodes[i + 1].node, filmLabelNodes[i + 1].clientRect.height );
        i++; // skip one more, so we don't nudge w.r.t an already nudged node
      }
    }

    filmLabelNodes.forEach(function(synth) { synth.node = null; synth.clientRect = null; });
  }

  function nudgeNode(node, nudge) {
    var currentY = Number(node.getAttribute('y'));
    node.setAttribute('y', currentY + (nudge * 1.25));
  }

  function isOverlap(a, b) {
    // works with client rects
    // top: 478.5, right: 370.203125, bottom: 497.5, left: 194.71875, width: 175.484375…
    return (_isHorizontalOverlap(a, b) && _isVerticalOverlap(a, b));
  } 

  function _isHorizontalOverlap(a, b) {
    return a.left >= b.left && a.left <= b.right ||
            b.left >= a.left && b.left <= a.right;

  }

  function _isVerticalOverlap(a, b) {
      return a.top >= b.top && a.top <= b.bottom ||
              b.top >= a.top && b.top <= a.bottom;
  }


  function update() {
    //filter data to show based on current filter settings.
    curNodesData = filterNodes(allData.nodes);
    curLinksData = filterLinks(allData.links, curNodesData);

    // # sort nodes based on current sort and update centers for
    // # radial layout
    if (layout == "radial") {
      artists = sortedArtists(curNodesData, curLinksData);
      updateCenters(artists);
    }

    // # reset nodes in force layout
    force.nodes(curNodesData);

    // # enter / exit for nodes
    updateNodes();
    updateTexts();

    // # always show links in force layout
    if (layout == "force") {
      force.links(curLinksData);
      updateLinks();
    } else {
      // # reset links so they do not interfere with
      // # other layouts. updateLinks() will be called when
      // # force is done animating.
      force.links([])
      // # if present, remove them from svg
      if (link) {
        link.data([]).exit().remove();
        link = null;
      }
    }
    // start me up!
    force.start();
  }

  return {
    init: init,
    toggleLayout: toggleLayout,
    toggleFilter: toggleFilter,
    toggleSort: toggleSort
  };
}

