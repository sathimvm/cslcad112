const SectionManager = {
  cuts: {
    x: { enabled: false, reverse: false, value: 0 },
    y: { enabled: false, reverse: false, value: 0 },
    z: { enabled: false, reverse: false, value: 0 }
  },
  _saveTimeout: null,

  hasActiveClip() {
    const cp = Viewer.clippingPlanes;
    return cp.xPos.constant < 1000000 || cp.xNeg.constant < 1000000 ||
           cp.yPos.constant < 1000000 || cp.yNeg.constant < 1000000 ||
           cp.zPos.constant < 1000000 || cp.zNeg.constant < 1000000 ||
           cp.custom.constant < 1000000;
  },

  updateRanges() {
    const bbox = Parser.bbox;
    ['x', 'y', 'z'].forEach(axis => {
      const min = Math.floor(bbox.min[axis]);
      const max = Math.ceil(bbox.max[axis]);
      const slider = document.getElementById(`cut-slider-${axis}`);
      const numInput = document.getElementById(`cut-${axis}-value`);
      if (slider) { slider.min = min; slider.max = max; slider.step = 0.1; }
      if (numInput) { numInput.min = min; numInput.max = max; numInput.step = 0.1; }
      const cut = this.cuts[axis];
      if (cut.value < min) cut.value = min;
      if (cut.value > max) cut.value = max;
      const displayValue = Number(cut.value.toFixed(2));
      if (numInput) numInput.value = displayValue;
      if (slider) slider.value = displayValue;
    });
    this.saveToStorage();
    this.apply();
  },

  getActivePlanes() {
    return Object.values(Viewer.clippingPlanes).filter(plane => plane.constant < 1000000);
  },

  apply() {
    const cp = Viewer.clippingPlanes;
    cp.xPos.constant = Infinity; cp.xNeg.constant = Infinity;
    cp.yPos.constant = Infinity; cp.yNeg.constant = Infinity;
    cp.zPos.constant = Infinity; cp.zNeg.constant = Infinity;

    const offset = Parser.globalOffset;
    const planeMap = {
      x: { pos: 'xPos', neg: 'xNeg' },
      y: { pos: 'yPos', neg: 'yNeg' },
      z: { pos: 'zPos', neg: 'zNeg' }
    };

    ['x', 'y', 'z'].forEach(axis => {
      const cut = this.cuts[axis];
      if (!cut.enabled) return;
      const centeredPos = cut.value - offset[axis];
      if (cut.reverse) {
        cp[planeMap[axis].neg].constant = -centeredPos;
      } else {
        cp[planeMap[axis].pos].constant = centeredPos;
      }
    });

    const customEnabled = document.getElementById('cut-c-enable');
    if (customEnabled && !customEnabled.checked) {
      cp.custom.constant = Infinity;
    } else if (cp.custom.userData && cp.custom.userData.baseConstant !== undefined) {
      cp.custom.constant = document.getElementById('cut-c-reverse').checked ? -cp.custom.userData.baseConstant : cp.custom.userData.baseConstant;
      if (document.getElementById('cut-c-reverse').checked) {
        cp.custom.normal.copy(cp.custom.userData.baseNormal).negate();
      } else {
        cp.custom.normal.copy(cp.custom.userData.baseNormal);
      }
    }

    const activePlanes = this.getActivePlanes();
    const hasActiveClip = this.hasActiveClip();
    Viewer.renderer.localClippingEnabled = hasActiveClip;

    Parser.modelGroup.children.forEach(mesh => {
      if (mesh.material) {
        mesh.material.clippingPlanes = hasActiveClip ? activePlanes : [];
        mesh.material.clipShadows = false;
        mesh.material.needsUpdate = true;
      }
      mesh.children.forEach(child => {
        if (!child.material) return;
        child.material.clippingPlanes = hasActiveClip ? activePlanes : [];
        child.material.clipShadows = false;
        child.material.needsUpdate = true;
      });
    });

    this.updateSectionEdges(activePlanes, hasActiveClip);
    this.updateSliderPanel();
  },

  updateSliderPanel() {
    const panel = document.getElementById('cut-slider-panel');
    const container = document.getElementById('cut-slider-rows');
    const anyEnabled = this.cuts.x.enabled || this.cuts.y.enabled || this.cuts.z.enabled;

    if (!anyEnabled) {
      panel.style.display = 'none';
      container.dataset.enabledAxes = '';
      return;
    }

    panel.style.display = 'block';
    const enabledAxes = ['x', 'y', 'z'].filter(axis => this.cuts[axis].enabled);
    const currentAxes = container.dataset.enabledAxes || '';
    const newAxes = enabledAxes.join(',');

    if (currentAxes === newAxes && container.children.length > 0) {
      enabledAxes.forEach(axis => {
        const val = Math.round(this.cuts[axis].value);
        const slider = document.getElementById(`cut-slider-${axis}`);
        const valLabel = document.getElementById(`cut-slider-${axis}-val`);
        if (slider) slider.value = val;
        if (valLabel) valLabel.innerText = val;
        const input = document.getElementById(`cut-${axis}-value`);
        if (input) input.value = val;
      });
      return;
    }

    container.dataset.enabledAxes = newAxes;
    let html = '';
    const labels = { x: 'X', y: 'Y', z: 'Z' };

    enabledAxes.forEach(axis => {
      const val = Number(this.cuts[axis].value.toFixed(2));
      const min = Math.floor(Parser.bbox.min[axis]);
      const max = Math.ceil(Parser.bbox.max[axis]);
      html += `
        <div class="cut-slider-row">
          <label class="axis-label">${labels[axis]}</label>
          <input type="range" id="cut-slider-${axis}" min="${min}" max="${max}" value="${val}" step="0.1"
                 oninput="App.onSliderChange('${axis}', this.value)">
          <span class="value-label" id="cut-slider-${axis}-val">${val}</span>
          <button class="slider-pick-btn" onclick="App.setPickPlane('${axis}')"><span class="material-icons" style="font-size:12px;">ads_click</span></button>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  onEnable(axis) {
    this.cuts[axis] = {
      enabled: document.getElementById(`cut-${axis}-enable`).checked,
      reverse: document.getElementById(`cut-${axis}-reverse`).checked,
      value: parseFloat(document.getElementById(`cut-${axis}-value`).value) || 0
    };
    this.apply();
    this.saveToStorage();
  },

  onValue(axis, val) {
    let value = parseFloat(val);
    if (isNaN(value)) value = 0;
    const min = Math.floor(Parser.bbox.min[axis]);
    const max = Math.ceil(Parser.bbox.max[axis]);
    if (value < min) value = min;
    else if (value > max) value = max;
    this.cuts[axis].value = value;

    const displayValue = Number(value.toFixed(2));
    document.getElementById(`cut-${axis}-value`).value = displayValue;
    const slider = document.getElementById(`cut-slider-${axis}`);
    const valLabel = document.getElementById(`cut-slider-${axis}-val`);
    if (slider) slider.value = displayValue;
    if (valLabel) valLabel.innerText = displayValue;
    this.apply();
    this.saveToStorage();
  },

  onSlider(axis, val) {
    let value = parseFloat(val);
    if (isNaN(value)) value = 0;
    const min = Math.floor(Parser.bbox.min[axis]);
    const max = Math.ceil(Parser.bbox.max[axis]);
    if (value < min) value = min;
    else if (value > max) value = max;
    this.cuts[axis].value = value;

    const displayValue = Number(value.toFixed(2));
    document.getElementById(`cut-${axis}-value`).value = displayValue;
    const slider = document.getElementById(`cut-slider-${axis}`);
    const valLabel = document.getElementById(`cut-slider-${axis}-val`);
    if (slider) slider.value = displayValue;
    if (valLabel) valLabel.innerText = displayValue;

    this.apply();
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.saveToStorage(), 500);
  },

  setCustomPlane(normal, point) {
    document.getElementById('custom-plane-ui').style.display = 'flex';
    document.getElementById('custom-plane-hint').style.display = 'none';
    document.getElementById('cut-c-enable').checked = true;

    const cutNormal = normal.clone().negate();
    Viewer.clippingPlanes.custom.normal.copy(cutNormal);
    Viewer.clippingPlanes.custom.constant = point.dot(cutNormal);
    Viewer.clippingPlanes.custom.userData = { baseNormal: cutNormal.clone(), baseConstant: point.dot(cutNormal) };
    this.apply();
  },

  clearCustomPlane() {
    document.getElementById('custom-plane-ui').style.display = 'none';
    document.getElementById('custom-plane-hint').style.display = 'block';
    Viewer.clippingPlanes.custom.constant = Infinity;
    this.apply();
  },

  updateSectionEdges(activePlanes, hasActiveClip) {
    Parser.modelGroup.children.forEach(mesh => {
      mesh.updateMatrixWorld(true);
      let sectionEdges = mesh.getObjectByName('sectionEdges');
      if (!sectionEdges) {
        sectionEdges = new THREE.LineSegments(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: 0xff1744, linewidth: (typeof ViewEngine !== 'undefined' && ViewEngine.sectionEdgeLineWeight) ? ViewEngine.sectionEdgeLineWeight : (Viewer.thickLineWeight || 1), transparent: true, opacity: 1 })
        );
        sectionEdges.name = 'sectionEdges';
        sectionEdges.visible = false;
        mesh.add(sectionEdges);
      }

      if (!hasActiveClip) {
        sectionEdges.visible = false;
        sectionEdges.geometry.dispose();
        sectionEdges.geometry = new THREE.BufferGeometry();
        return;
      }

      const positions = this.buildSectionEdgePositions(mesh, activePlanes);
      if (positions.length === 0) {
        sectionEdges.visible = false;
        sectionEdges.geometry.dispose();
        sectionEdges.geometry = new THREE.BufferGeometry();
        return;
      }

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      edgeGeometry.computeBoundingSphere();
      sectionEdges.geometry.dispose();
      sectionEdges.geometry = edgeGeometry;
      sectionEdges.visible = true;
    });
  },

  buildSectionEdgePositions(mesh, activePlanes) {
    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes.position) return [];
    const position = geometry.attributes.position;
    const index = geometry.index;
    const points = [];
    const worldA = new THREE.Vector3();
    const worldB = new THREE.Vector3();
    const worldC = new THREE.Vector3();
    const localA = new THREE.Vector3();
    const localB = new THREE.Vector3();
    const localC = new THREE.Vector3();

    const edgeIntersection = (p1, d1, p2, d2) => {
      const t = d1 / (d1 - d2);
      return p1.clone().lerp(p2, t);
    };

    const addSegment = (a, b) => {
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
    };

    const addUnique = (existing, candidate) => {
      for (let i = 0; i < existing.length; i += 3) {
        if (existing[i] === candidate.x && existing[i + 1] === candidate.y && existing[i + 2] === candidate.z) return false;
      }
      existing.push(candidate.x, candidate.y, candidate.z);
      return true;
    };

    const processPlane = (plane, a, b, c) => {
      const dA = plane.distanceToPoint(a);
      const dB = plane.distanceToPoint(b);
      const dC = plane.distanceToPoint(c);
      const found = [];

      if (Math.abs(dA) < 1e-6) addUnique(found, a.clone());
      if (Math.abs(dB) < 1e-6) addUnique(found, b.clone());
      if (Math.abs(dC) < 1e-6) addUnique(found, c.clone());
      if (dA * dB < 0) addUnique(found, edgeIntersection(a, dA, b, dB));
      if (dB * dC < 0) addUnique(found, edgeIntersection(b, dB, c, dC));
      if (dC * dA < 0) addUnique(found, edgeIntersection(c, dC, a, dA));

      if (found.length === 6) {
        addSegment(new THREE.Vector3(found[0], found[1], found[2]), new THREE.Vector3(found[3], found[4], found[5]));
      } else if (found.length === 9) {
        const p0 = new THREE.Vector3(found[0], found[1], found[2]);
        const p1 = new THREE.Vector3(found[3], found[4], found[5]);
        const p2 = new THREE.Vector3(found[6], found[7], found[8]);
        addSegment(p0, p1);
        addSegment(p1, p2);
      }
    };

    const meshMatrix = mesh.matrixWorld;

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        localA.fromBufferAttribute(position, index.getX(i));
        localB.fromBufferAttribute(position, index.getX(i + 1));
        localC.fromBufferAttribute(position, index.getX(i + 2));
        worldA.copy(localA).applyMatrix4(meshMatrix);
        worldB.copy(localB).applyMatrix4(meshMatrix);
        worldC.copy(localC).applyMatrix4(meshMatrix);
        activePlanes.forEach(plane => processPlane(plane, worldA, worldB, worldC));
      }
    } else {
      for (let i = 0; i < position.count; i += 3) {
        localA.fromBufferAttribute(position, i);
        localB.fromBufferAttribute(position, i + 1);
        localC.fromBufferAttribute(position, i + 2);
        worldA.copy(localA).applyMatrix4(meshMatrix);
        worldB.copy(localB).applyMatrix4(meshMatrix);
        worldC.copy(localC).applyMatrix4(meshMatrix);
        activePlanes.forEach(plane => processPlane(plane, worldA, worldB, worldC));
      }
    }

    return points;
  },

  saveToStorage() {
    saveSettings('sectionCuts', this.cuts);
  },

  loadFromStorage() {
    const saved = loadSettings('sectionCuts', null);
    if (saved) {
      for (let axis in saved) {
        if (this.cuts[axis]) {
          this.cuts[axis].enabled = saved[axis].enabled || false;
          this.cuts[axis].reverse = saved[axis].reverse || false;
          this.cuts[axis].value = Math.round(saved[axis].value) || 0;
        }
      }
      ['x', 'y', 'z'].forEach(axis => {
        document.getElementById(`cut-${axis}-enable`).checked = this.cuts[axis].enabled;
        document.getElementById(`cut-${axis}-reverse`).checked = this.cuts[axis].reverse;
        document.getElementById(`cut-${axis}-value`).value = this.cuts[axis].value;
      });
      this.updateRanges();
    }
  }
};

window.SectionManager = SectionManager;
