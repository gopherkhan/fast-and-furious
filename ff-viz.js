
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
                if (d.type === 'movie') {
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

  function forceTick(e) {
    node
      .attr("cx", function (d) {
        if (d.type === 'movie') {
          d.x = d.order * (width / 11);
        }
        return d.x;
      })
      .attr("cy", function (d) {
        if (d.type === "movie") {
          var fudge = d.id === 'blt' ? 40 : 0;
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
            var margin = (d.type === 'movie') ? margins.movie : margins.cast;
            return d.x + margin;
          })
          .attr("y", function(d) {
            var margin = (d.type === 'movie') ? margins.movie : margins.cast;
            return d.y + margin;
          });
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
      .attr("cy", function(d) { return d.y; });
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
      .attr("class", "label hidden")
      .attr("data-id", function(d) { return d.id; })
      .attr("x", function(d) { return d.x + 15; })
      .attr("y", function(d) { return d.y + 15; })
      .text(function(d) { return d.name; });
  }

  function showDetails (d) {
    var textIds = [d.id];
    if (d.type !== "movie") {
      curLinksData.forEach(function (l) {
        if (l.source.id === d.id) {
          textIds.push(l.target.id);
        }
      });
    }
    var textIdsCss = textIds.map(function(id) { return 'text[data-id="' + id + '"]'}).join(",");
    textsG.selectAll(textIdsCss).classed('hidden', false).moveToFront();
    linksG.selectAll('line[data-source="' + d.id + '"]').classed('active', true).moveToFront();
  }

  function hideDetails (d) {
    textsG.selectAll('text').classed('hidden', true);
    linksG.selectAll('line').classed('active', false);
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

window.DataMaker = function DataMaker() {
  var nodes = [
    {
      "name": "Better Luck Tomorrow",
      "director": "Justin Lin",
      "type": "movie",
      "id": "blt",
      "playcount": 123,
      order: 3,
      url: 'http://www.imdb.com/title/tt0280477'
    },
    {
      "name": "The Fast and the Furious",
      "director": "Rob Cohen",
      "type": "movie",
      "id": "ff1",
      "playcount": 123,
      order: 1,
      url: 'http://www.imdb.com/title/tt0232500'
    },
    {
      "name": "Turbo-Charged Prelude",
      "director": "Philip G. Atwell",
      "type": "movie",
      "id": "ff1.5",
      "playcount": 123,
      order: 1.5,
      url: 'http://www.imdb.com/title/tt2055789'
    },
    {
      "name": "2 Fast 2 Furious",
      "director": "John Singleton",
      "type": "movie",
      "id": "ff2",
      "playcount": 123,
      order: 2,
      url: 'http://www.imdb.com/title/tt0322259'
    },
    {
      "name": "The Fast and the Furious: Tokyo Drift",
      "director": "Justin Lin",
      "type": "movie",
      "id": "ff3",
      "playcount": 123,
      order: 7,
      url: 'http://www.imdb.com/title/tt0463985'
    },
    {
      "name": "Los Bandoleros",
      "director": "Vin Diesel",
      "type": "movie",
      "id": "ff3.5",
      "playcount": 123,
      order: 3.5,
      url: 'http://www.imdb.com/title/tt1538503'
    },
    {
      "name": "Fast & Furious",
      "director": "Justin Lin",
      "type": "movie",
      "id": "ff4",
      "playcount": 123,
      order: 4,
      url: 'http://www.imdb.com/title/tt1013752'
    },
    {
      "name": "Fast Five",
      "director": "Justin Lin",
      "type": "movie",
      "id": "ff5",
      "playcount": 123,
      order: 5,
      url: 'http://www.imdb.com/title/tt1596343'
    },
    {
      "name": "Furious 6",
      "director": "Justin Lin",
      "type": "movie",
      "id": "ff6",
      "playcount": 123,
      order: 6,
      url: 'http://www.imdb.com/title/tt1905041'
    },
    {
      "name": "Furious 7",
      "director": "James Wan",
      "type": "movie",
      "id": "ff7",
      "playcount": 123,
      order: 8,
      url: 'http://www.imdb.com/title/tt2820852'
    },
    {
      "name": "Fast 8",
      "director": "F. Gary Gray",
      "type": "movie",
      "id": "ff8",
      "playcount": 123,
      order: 9,
      url: 'http://www.imdb.com/title/tt4630562'
    },
    {
      "name": "Fast & Furious 9",
      "artist": "Party Boston",
      "type": "movie",
      "id": "ff9",
      "playcount": 123,
      order: 10,
      url: 'http://www.imdb.com/title/tt5433138'
    },
    {
      "name": "Brian O'Conner",
      "actor": "Paul Walker",
      "id": "pw",
      url: 'http://www.imdb.com/character/ch0004175'
    },
    {
      name: "Dominic Toretto",
      actor: "Vin Diesel",
      id: "vd",
      url: 'http://www.imdb.com/character/ch0004171'
    },
    {
      name: "Han Seoul-Oh",
      actor: "Sung Kang",
      id: "sk",
      url: 'http://www.imdb.com/character/ch0063891',
      img: 'http://ia.media-imdb.com/images/M/MV5BMjkzNDMwMTIxM15BMl5BanBnXkFtZTcwMDgyNzE5NA@@._V1._SX100_SY140_.jpg'
    },
    {
      name: "Tej",
      actor: "Ludacris",
      id: "luda",
      url: 'http://www.imdb.com/character/ch0004183'
    },
    {
      name: "Roman Pearce",
      actor: "Tyrese",
      id: "ty",
      url: 'http://www.imdb.com/character/ch0089116'
    },
    {
      name: "Letty Ortiz",
      actor: "Michelle Rodriguez",
      id: "mr",
      url: 'http://www.imdb.com/character/ch0004176'
    },
    {
      name: "Mia",
      actor: "Jordana Brewster",
      id: "jb",
      url: 'http://www.imdb.com/character/ch0380086'
    },
    {
      name: "Monica Fuentes",
      actor: "Eva Mendes",
      id: "em",
      url: 'http://www.imdb.com/character/ch0004172',
      img: 'http://ia.media-imdb.com/images/M/MV5BMjE5MDE2OTY2Nl5BMl5BanBnXkFtZTYwNTU4NTE3._V1._SX100_SY140_.jpg'
    },
    {
      name: "Suki",
      actor: "Devon Aoki",
      id: "da",
      url: 'http://www.imdb.com/character/ch0004174',
      img: 'http://ia.media-imdb.com/images/M/MV5BMTUwOTI5OTI5N15BMl5BanBnXkFtZTYwODQ3NTE3._V1._CR0,0,485,485_SS90_.jpg'
    },
    // {
    //   name: "Girl",
    //   actor: "Minka Kelly",
    //   id: "girl"
    // },
    {
      name: "Gisele",
      actor: "Gal Gadot",
      id: "gal",
      url: 'http://www.imdb.com/character/ch0139733',
      img: 'http://ia.media-imdb.com/images/M/MV5BMTU5MzgwOTIxMV5BMl5BanBnXkFtZTcwOTYyNzE5NA@@._V1._SX100_SY140_.jpg'
    }
  ];

  var links = [
    {
      source: 'sk',
      target: 'blt',
      type: 'cast'
    },
    {
      source: 'sk',
      target: 'ff3',
      type: 'cast'
    },
    {
      source: 'sk',
      target: 'ff3.5',
      type: 'cast'
    },
    {
      source: 'sk',
      target: 'ff4',
      type: 'cast'
    },
    {
      source: 'sk',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'sk',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'sk',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff1',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff2',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff1.5',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff4',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'pw',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff1',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff3',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff3.5',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff4',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff8',
      type: 'cast'
    },
    {
      source: 'vd',
      target: 'ff9',
      type: 'cast'
    },
    {
      source: 'mr',
      target: 'ff1',
      type: 'cast'
    },
    {
      source: 'mr',
      target: 'ff3.5',
      type: 'cast'
    },
    {
      source: 'mr',
      target: 'ff4',
      type: 'cast'
    },
    {
      source: 'mr',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'mr',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'mr',
      target: 'ff8',
      type: 'cast'
    },
    {
      source: 'jb',
      target: 'ff1',
      type: 'cast'
    },
    {
      source: 'jb',
      target: 'ff4',
      type: 'cast'
    },
    {
      source: 'jb',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'jb',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'jb',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'gal',
      target: 'ff4',
      type: 'cast'
    },
    {
      source: 'gal',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'gal',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'luda',
      target: 'ff2',
      type: 'cast'
    },
    {
      source: 'luda',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'luda',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'luda',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'luda',
      target: 'ff8',
      type: 'cast'
    },
    {
      source: 'ty',
      target: 'ff2',
      type: 'cast'
    },
    {
      source: 'ty',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'ty',
      target: 'ff6',
      type: 'cast'
    },
    {
      source: 'ty',
      target: 'ff7',
      type: 'cast'
    },
    {
      source: 'ty',
      target: 'ff8',
      type: 'cast'
    },
    {
      source: 'ty',
      target: 'ff9',
      type: 'cast'
    },
    {
      source: 'em',
      target: 'ff2',
      type: 'cast'
    },
    {
      source: 'em',
      target: 'ff5',
      type: 'cast'
    },
    {
      source: 'em',
      target: 'ff8',
      type: 'cast'
    },
    {
      source: 'da',
      target: 'ff2',
      type: 'cast'
    },
    {
      source: 'ff1',
      target: 'ff1.5',
      type: "chronology"
    },
    {
      source: 'ff1.5',
      target: 'ff2',
      type: "chronology"
    },
    {
      source: 'ff2',
      target: 'ff3.5',
      type: "chronology"
    },
    {
      source: 'blt',
      target: 'ff3.5',
      type: "chronology"
    },
    {
      source: 'ff3.5',
      target: 'ff4',
      type: "chronology"
    },
    {
      source: 'ff4',
      target: 'ff5',
      type: "chronology"
    },
    {
      source: 'ff5',
      target: 'ff6',
      type: "chronology"
    },
    {
      source: 'ff6',
      target: 'ff3',
      type: "chronology"
    },
    {
      source: 'ff3',
      target: 'ff7',
      type: "chronology"
    },
    {
      source: 'ff7',
      target: 'ff8',
      type: "chronology"
    },
    {
      source: 'ff8',
      target: 'ff9',
      type: "chronology"
    }
  ];

  return {
    nodes: nodes,
    links: links
  }
}
