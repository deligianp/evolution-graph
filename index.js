function _defineProperty(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {value: value, enumerable: true, configurable: true, writable: true});
    } else {
        obj[key] = value;
    }
    return obj;
}

export class LayeredGraph {

    _initialize() {
        _defineProperty(this, "nodes", null);
        _defineProperty(this, "layers", null);
        _defineProperty(this, "links", null);
        _defineProperty(this, "inDegreeIndex", null);
        _defineProperty(this, "outDegreeIndex", null);
        _defineProperty(this, "calculatedLayout", undefined);
        _defineProperty(this, "width", undefined);
        _defineProperty(this, "height", undefined);
        _defineProperty(this, "options", {
            rendering: {
                paddingX: 5,
                paddingY: 5,
                layerMargin: 80,
                nodeMargin: 10,
                nodeWidth: 20,
                nodeUnitHeight: 20,
                linkType: 'straight'
            },
            evaluateNodeHeightScore: node => {
                const n_predecessors = this.inDegreeIndex[node.name].length;
                const score = this.inDegreeIndex[node.name].reduce((total, p_node) => {
                    const parentIndex = p_node.layerIdx;
                    return total + (parentIndex + 1);
                }, 0.0) / n_predecessors;
                return score;
            },
            nodeComparator: (nodeA, nodeB) => {
                const nodeAPredecessors = this.inDegreeIndex[nodeA.name];
                const nodeBPredecessors = this.inDegreeIndex[nodeB.name];
                if (nodeAPredecessors && nodeBPredecessors) {
                    const nodeAScore = this.options.evaluateNodeHeightScore(nodeA);
                    const nodeBScore = this.options.evaluateNodeHeightScore(nodeB);
                    if (nodeAScore === nodeBScore) {
                        if (nodeAPredecessors.length === nodeBPredecessors.length) {
                            return nodeA.name < nodeB.name ? -1 : 1;
                        }
                        return nodeAPredecessors.length - nodeBPredecessors.length
                    }
                    return nodeAScore - nodeBScore;
                } else if (!nodeAPredecessors && !nodeBPredecessors) {
                    return nodeA.name < nodeB.name ? -1 : 1;
                } else if (!nodeAPredecessors) {
                    return 1;
                } else {
                    return -1;
                }
            },
            layerComparator: undefined,
            weighted: false
        });
    }

    constructor(width, height, data = undefined, options = undefined) {
        this._initialize();

        this.width = width;
        this.height = height;
        if (data) {
            /* If data is provided during instantiation
                - Discover nodes and links
                - Perform sanity check on new data
             */
            this.loadData(data);
        }
        if (options) {
            /* If options are defined during instantiation
                - Overwrite values
             */
            this.loadOptions(options);
        }
    }

    loadData(data) {
        this._discoverNodes(data);
        this._discoverLinks(data);
        const sanityCheckResult = this._sanityCheck();
        if (sanityCheckResult !== '') {
            throw sanityCheckResult;
        }
        this.calculatedLayout = null;
    }

    loadOptions(newOptions) {
        this.options = {
            ...this.options,
            ...newOptions,
            rendering: {
                ...this.options.rendering,
                ...newOptions.rendering
            },
        }
        this.calculatedLayout = null;
    }

    getLayout() {
        // TODO: Perform sanity check on configuration
        // Generate corresponding layout and return
        if (!this.calculatedLayout) {
            this._fitLayers();
            this._fitNodesLayerPosition();
            if (this.options.weighted) {
                this.options.rendering.nodeUnitHeight = this._inferUnitHeight();
            }
            this._fitNodeY();
            this._fitLinks()

            this.calculatedLayout = {
                nodes: Object.keys(this.nodes).map(nodeName => this.nodes[nodeName]),
                links: Object.keys(this.links).map(linkName => this.links[linkName])
            };
        }

        return this.calculatedLayout;
    }


    _discoverNodes(data) {
        this.nodes = {};
        this.layers = [];
        this.layersIndex = {};
        data.nodes.forEach((node, idx) => {
            if (!this.nodes.hasOwnProperty(node.name)) {
                const nodeObject = {...node};
                nodeObject.idx = idx;
                this.nodes[nodeObject.name] = nodeObject;

                const nodeLayer = node.layer;
                if (!this.layersIndex.hasOwnProperty(nodeLayer)) {
                    this.layersIndex[nodeLayer] = {};
                    this.layersIndex[nodeLayer].nodes = []
                }
                this.layersIndex[nodeLayer].nodes.push(nodeObject);
            }
        });

        Object.keys(this.layersIndex).sort(this.options.layerComparator).forEach((layer, idx) => {
            this.layers.push(this.layersIndex[layer].nodes);
            this.layersIndex[layer].rank = idx;
        });
    }

    _discoverLinks(data) {
        this.links = {};
        this.inDegreeIndex = {};
        this.outDegreeIndex = {};

        data.links.forEach(link => {
            const source = this.nodes[link.source];
            const target = this.nodes[link.target];
            const name = `${link.source}-${link.target}`;
            const linkObject = {...link, source, target};
            this.links[name] = linkObject;

            if (!this.inDegreeIndex.hasOwnProperty(link.target)) {
                this.inDegreeIndex[link.target] = [];
            }
            this.inDegreeIndex[link.target].push(source);

            if (!this.outDegreeIndex.hasOwnProperty(link.source)) {
                this.outDegreeIndex[link.source] = [];
            }
            this.outDegreeIndex[link.source].push(target);
        });
    }

    _sanityCheck() {
        let errorMesssage = '';
        // Makes sure that every link defined in data, is not going backwards (e.g. from layer 23 to layer 14)
        Object.keys(this.links).every(
            linkName => {
                const {source, target} = this.links[linkName];
                const check = this.layersIndex[source.layer].rank < this.layersIndex[target.layer].rank;
                if (!check) {
                    errorMesssage = `Link '${linkName}' is pointing to a node of a previous layer`;
                }
                return check;
            }
        );
        return errorMesssage;
    }


    _fitLayers() {
        const {layerMargin, nodeWidth, paddingX} = this.options.rendering;
        this.layers.forEach((layer, idx) => {
            const layerX = paddingX + ((idx + 0.5) * layerMargin) + idx * nodeWidth;
            layer.forEach(node => {
                node.x = layerX;
            });
        });
    }

    setWeighted(weighted) {
        this.options.weighted = weighted;
    }

    _inferUnitHeight() {
        const [highestLayerWeight, numberOfNondes] = this.layers.map(layer => [layer.reduce((total, node) => {
            return total + (node.weight || 0);
        }, 0.0), layer.length]).sort((layer0Weights, layer1Weights) => layer0Weights[0] - layer1Weights[1]).pop();
        return Math.max((this.height - (2 * this.options.rendering.paddingY) - ((numberOfNondes - 1) * this.options.rendering.nodeMargin)) / highestLayerWeight, 1);
    }

    _fitNodesLayerPosition() {
        this.layers = this.layers.map((layer, idx) => {
            if (idx > 0) {
                return layer.sort(this.options.nodeComparator).map((node, idx) => {
                    node.layerIdx = idx;
                    return node;
                });
            } else {
                return layer.map((node, idx) => {
                    node.layerIdx = idx;
                    return node;
                });
            }
        })
    }

    _fitNodeY() {
        const {nodeMargin, nodeUnitHeight, paddingY, nodeWidth} = this.options.rendering;
        this.layers.forEach(layer => {
            let accumulatedReservedSpace = 0;
            layer.forEach((node, idx) => {
                const nodeWeight = this.options.weighted ? node.weight || 0 : 1;
                const nodeHeight = Math.max(Math.floor(nodeWeight * nodeUnitHeight), 1);
                const nodeY = paddingY + accumulatedReservedSpace + (idx * nodeMargin);

                node.y = nodeY;
                node.height = nodeHeight;
                node.width = nodeWidth;
                accumulatedReservedSpace += nodeHeight;
            });
        });
    }

    _fitLinks() {
        Object.keys(this.links).forEach(linkName => {
            const link = this.links[linkName];
            const {source, target} = link;

            const [start, end] = [
                [
                    source.x + source.width,
                    source.y + Math.floor(source.height / 2)
                ],
                [
                    target.x,
                    target.y + Math.floor(target.height / 2)
                ]
            ]

            link.start = start
            link.end = end

            if (this.options.rendering.linkType.toLowerCase() === 'c_bezier') {
                const [controlPoint0, controlPoint1] = [
                    [
                        start[0] + Math.floor((end[0] - start[0]) / 2),
                        start[1]
                    ],
                    [
                        start[0] + Math.floor((end[0] - start[0]) / 2),
                        end[1]
                    ]
                ]

                link.controlPoint0 = controlPoint0;
                link.controlPoint1 = controlPoint1;
            }
        });
    }

    getNodeMargin() {
        return this.options.nodeMargin;
    }

    getLayerMargin() {
        return this.options.layerMargin;
    }
}

