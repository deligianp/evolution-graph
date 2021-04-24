export class CustomDiagram {
    nodes = null;
    layers = null;
    floatingNodes = null;
    links = null;

    constructor(data) {
        this._discoverNodes(data);
        this._discoverLinks(data);
    }

    _discoverNodes(data) {
        [this.nodes, this.layers, this.floatingNodes] = [{}, {}, []]
        data.nodes.forEach((node, idx) => {
            if (!this.nodes.hasOwnProperty(node.name)) {
                const nodeObject = {...node};
                nodeObject.idx = idx;
                this.nodes[nodeObject.name] = nodeObject;

                if (node.layer) {
                    if (! this.layers.hasOwnProperty(node.layer)){
                        this.layers[node.layer]=[];
                    }
                    this.layers[node.layer].push(nodeObject);
                } else {
                    this.floatingNodes.push(nodeObject);
                }
            }
        })
    }

    _discoverLinks(data) {
        this.links = {};
        data.links.forEach(link => {
            const source = this.nodes[link.source];
            const target = this.nodes[link.target];
            const name = `${link.source}-${link.target}`;
            const linkObject = {...link, source, target};
            this.links[name] = linkObject;
        })
    }

}

