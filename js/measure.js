// =====================================================
// MEASURE TOOL (moved from inline index.html)
// =====================================================
const MeasureTool = {
  mode: 'distance', points: [], markers: [], labels: [], group: new THREE.Group(), snapCursor: null,
  previewLine: null, previewLabel: null, lastSnapData: null,
  lastHit: null, measurementLocked: false, axisLock: 'free', ignoreNextPointerUp: false,
  axisColors: {
    free: 0x000000,
    x: 0xff0000, // SketchUp Bright Red
    y: 0x00ff00, // SketchUp Bright Green
    z: 0x0000ff, // SketchUp Bright Blue
    lightX: 0xffaaaa, // Faded/Light Red
    lightY: 0xaaffaa, // Faded/Light Green
    lightZ: 0xaaaaff  // Faded/Light Blue
  },
  
  init() {
    Viewer.scene.add(this.group);

    this.snapCursor = new THREE.Group();
    this.snapCursor.renderOrder = 1000;
    this.snapCursor.visible = false;

    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false });
    this.cursorDefault = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), cursorMat);
    this.cursorDefault.visible = true;
    this.snapCursor.add(this.cursorDefault);

    const squareGeo = new THREE.PlaneGeometry(1.8, 1.8);
    const squareBorderPts = [
      new THREE.Vector3(-0.9, -0.9, 0),
      new THREE.Vector3(0.9, -0.9, 0),
      new THREE.Vector3(0.9, 0.9, 0),
      new THREE.Vector3(-0.9, 0.9, 0)
    ];
    this.cursorEdgeHover = new THREE.Group();
    this.cursorEdgeHover.visible = false;
    this.cursorEdgeHover.add(new THREE.Mesh(squareGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 })));
    this.cursorEdgeHover.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(squareBorderPts), new THREE.LineBasicMaterial({ color: 0x1d4ed8, depthTest: false })));
    this.snapCursor.add(this.cursorEdgeHover);

    Viewer.scene.add(this.snapCursor);

    const cssSize = 140;
    const dpr = window.devicePixelRatio || 1;
    const resSize = cssSize * dpr;
    const canvas = document.getElementById('mag-canvas');
    if (canvas) {
      canvas.width = resSize;
      canvas.height = resSize;
      canvas.style.width = cssSize + 'px';
      canvas.style.height = cssSize + 'px';
    }
    
    this.lastSnapData = null;
    this.lastHit = null;
    this.previewLine = null;
    this.previewLabel = null;
    this.hideReadout();
  },
  setMode(m) {
      this.mode = m;
      this.points = [];
      this.clearPreviewLine();
      this.hideReadout();
      this.axisLock = 'free';
      this.updateAxisButtons();
  },
  getAxisColor() {
      return this.axisColors[this.axisLock] || this.axisColors.free;
  },
  getLineColor(ptA, ptB) {
      if (this.axisLock !== 'free') return this.getAxisColor();
      if (!ptA || !ptB) return this.getAxisColor();
      
      const diff = new THREE.Vector3().subVectors(ptB, ptA);
      const dist = diff.length();
      if (dist === 0) return this.axisColors.free;
      
      const dir = diff.clone().normalize();
      
      // Calculate absolute physical deviation (in mm) from each axis
      const devX = Math.sqrt(diff.y * diff.y + diff.z * diff.z);
      const devY = Math.sqrt(diff.x * diff.x + diff.z * diff.z);
      const devZ = Math.sqrt(diff.x * diff.x + diff.y * diff.y);

      // 1. Perfect alignment (≤ 1mm deviation AND clearly dominant axis)
      if (devX <= 1.0 && Math.abs(dir.x) > 0.9) return this.axisColors.x;
      if (devY <= 1.0 && Math.abs(dir.y) > 0.9) return this.axisColors.y;
      if (devZ <= 1.0 && Math.abs(dir.z) > 0.9) return this.axisColors.z;

      // 2. Near alignment (≤ 10mm deviation AND clearly dominant axis)
      if (devX <= 10.0 && Math.abs(dir.x) > 0.9) return this.axisColors.lightX;
      if (devY <= 10.0 && Math.abs(dir.y) > 0.9) return this.axisColors.lightY;
      if (devZ <= 10.0 && Math.abs(dir.z) > 0.9) return this.axisColors.lightZ;
      
      return this.axisColors.free; // Default to black
  },
  setAxisLock(axis) {
      this.axisLock = axis || 'free';
      this.updateAxisButtons();
      // Only clear if the measurement was already fully completed and locked in place
      if (this.measurementLocked) {
          this.clear();
      }
      // Note: We explicitly DO NOT clear this.points here. 
      // This allows the user to click Point A, click an Axis Lock button, and continue measuring.
  },
  updateAxisButtons() {
      document.querySelectorAll('.measure-btn[data-axis]').forEach(btn => {
          const isActive = btn.dataset.axis === this.axisLock;
          btn.classList.toggle('active', isActive);
      });
  },
  applyAxisLock(point) {
      if (!point || this.axisLock === 'free') return point.clone();
      
      // If the measurement is locked (finished) or we haven't placed Point A yet,
      // the cursor should roam freely to find the next snap point.
      if (this.measurementLocked || !this.points || this.points.length === 0) {
          return point.clone();
      }

      // We are actively dragging Point B, so lock it relative to Point A
      const base = this.points[0].clone();
      const locked = point.clone();
      
      if (this.axisLock === 'x') {
          locked.y = base.y;
          locked.z = base.z;
      } else if (this.axisLock === 'y') {
          locked.x = base.x;
          locked.z = base.z;
      } else if (this.axisLock === 'z') {
          locked.x = base.x;
          locked.y = base.y;
      }
      return locked;
  },
  ensureReadout() {
      if (document.getElementById('measure-readout')) return;
      const panel = document.createElement('div');
      panel.id = 'measure-readout';
      panel.className = 'measure-readout hidden';
      panel.innerHTML = `
        <div class="measure-readout-header">
          <div class="measure-readout-title">
            <span class="material-icons">straighten</span>
            <span>Measure</span>
          </div>
          <button type="button" class="measure-readout-reset" aria-label="Reset measurement">↺</button>
        </div>
        <div class="measure-readout-content"></div>
      `;
      const resetButton = panel.querySelector('.measure-readout-reset');
      if (resetButton) {
          resetButton.addEventListener('pointerdown', (event) => {
              event.stopPropagation();
              event.preventDefault();
          });
          resetButton.addEventListener('click', (event) => {
              event.stopPropagation();
              event.preventDefault();
              this.ignoreNextPointerUp = true;
              this.clear();
          });
      }
      document.body.appendChild(panel);
  },
  showReadout() {
      this.ensureReadout();
      const panel = document.getElementById('measure-readout');
      if (panel) panel.classList.remove('hidden');
  },
  hideReadout() {
      const panel = document.getElementById('measure-readout');
      if (panel) panel.classList.add('hidden');
  },
  updateReadout(livePoint = null) {
      this.ensureReadout();
      const panel = document.getElementById('measure-readout');
      const content = panel ? panel.querySelector('.measure-readout-content') : null;
      if (!panel || !content) return;

      if (this.mode !== 'distance') {
          content.innerHTML = '<div class="measure-readout-empty">Coordinate mode</div>';
          this.showReadout();
          return;
      }

      let ptA = null, ptB = null, dist = null;

      if (this.points.length === 0) {
          if (livePoint) ptA = livePoint;
      } else if (this.points.length === 1) {
          ptA = this.points[0];
          if (livePoint) {
              ptB = livePoint;
              dist = ptA.distanceTo(ptB);
          }
      } else if (this.points.length >= 2) {
          ptA = this.points[0];
          ptB = this.points[1];
          dist = ptA.distanceTo(ptB);
      }

      const formatPt = (pt) => {
          if (!pt) return '--';
          const wPt = pt.clone().add(Parser.globalOffset || new THREE.Vector3());
          return `${wPt.x.toFixed(1)}, ${wPt.y.toFixed(1)}, ${wPt.z.toFixed(1)}`;
      };

      if (!ptA && !ptB) {
          content.innerHTML = `
              <div class="measure-readout-row"><span class="measure-readout-tag">A</span><span>--</span></div>
              <div class="measure-readout-row"><span class="measure-readout-tag">B</span><span>--</span></div>
              <div class="measure-readout-row total"><span class="measure-readout-tag">C</span><span class="measure-readout-value">-- mm</span></div>
          `;
          this.showReadout();
          return;
      }

      const rows = [
          `<div class="measure-readout-row"><span class="measure-readout-tag">A</span><span>${formatPt(ptA)}</span></div>`,
          `<div class="measure-readout-row"><span class="measure-readout-tag">B</span><span>${formatPt(ptB)}</span></div>`,
          `<div class="measure-readout-row total"><span class="measure-readout-tag">C</span><span class="measure-readout-value">${dist !== null ? dist.toFixed(2) + ' mm' : '-- mm'}</span></div>`
      ];
      content.innerHTML = rows.join('');
      this.showReadout();
  },
  getSnappedData(intersect) {
      let snapPoint = intersect.point.clone();
      let isVertex = false;
      let isEdge = false;
      let snapType = 'point';
      
      const distToCam = Viewer.camera.position.distanceTo(intersect.point);
      const threshold = Math.min(Math.max(distToCam * 0.035, 10), 28);
      const candidates = [];

      const addCandidate = (pt, type) => {
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) return;
          
          // Prevent snapping to the exact same point we already clicked (Point A)
          if (this.points && this.points.length > 0) {
              for (let i = 0; i < this.points.length; i++) {
                  // If the candidate is within 0.1mm of an already selected point, ignore it completely
                  if (pt.distanceTo(this.points[i]) < 0.1) return; 
              }
          }

          const d = intersect.point.distanceTo(pt);
          
          // Aggressively auto-snap to nearest corners (vertices) by doubling their catch radius
          const catchRadius = (type === 'vertex') ? threshold * 2.0 : threshold;
          
          if (d <= catchRadius) {
              candidates.push({ p: pt.clone(), d, type });
          }
      };

      const collectFromObject = (obj) => {
          if (!obj || !obj.geometry || !obj.visible || !obj.geometry.attributes || !obj.geometry.attributes.position) return;
          const pos = obj.geometry.attributes.position;
          const m = obj.matrixWorld;
          const isLineGeometry = obj.isLine || obj.isLineSegments || obj.isLineLoop;
          if (isLineGeometry) {
              for (let i = 0; i < pos.count; i += 2) {
                  const a = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m);
                  const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(m);
                  addCandidate(a, 'vertex');
                  addCandidate(b, 'vertex');
                  const dir = new THREE.Vector3().subVectors(b, a);
                  const segLenSq = dir.lengthSq();
                  if (!segLenSq) continue;
                  const toA = new THREE.Vector3().subVectors(intersect.point, a);
                  const t = THREE.MathUtils.clamp(dir.dot(toA) / segLenSq, 0, 1);
                  const closest = a.clone().add(dir.multiplyScalar(t));
                  addCandidate(closest, 'edge');
              }
              return;
          }

          const triCount = Math.floor(pos.count / 3);
          for (let i = 0; i < triCount; i++) {
              const a = new THREE.Vector3().fromBufferAttribute(pos, i * 3).applyMatrix4(m);
              const b = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 1).applyMatrix4(m);
              const c = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 2).applyMatrix4(m);
              const center = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
              addCandidate(a, 'vertex');
              addCandidate(b, 'vertex');
              addCandidate(c, 'vertex');
              addCandidate(center, 'center');
              const edges = [[a, b], [b, c], [c, a]];
              edges.forEach(([p1, p2]) => {
                  const lineDir = new THREE.Vector3().subVectors(p2, p1);
                  const segLenSq = lineDir.lengthSq();
                  if (!segLenSq) return;
                  const ptToA = new THREE.Vector3().subVectors(intersect.point, p1);
                  const t = THREE.MathUtils.clamp(lineDir.dot(ptToA) / segLenSq, 0, 1);
                  const closest = p1.clone().add(lineDir.multiplyScalar(t));
                  addCandidate(closest, 'edge');
              });
          }
      };

      if (intersect.object && intersect.object.geometry) collectFromObject(intersect.object);
      if (Parser && Parser.modelGroup) {
          Parser.modelGroup.traverse(obj => {
              if (obj !== intersect.object) collectFromObject(obj);
          });
      }

      if (candidates.length) {
          const priority = { vertex: 0, edge: 1, center: 2 };
          candidates.sort((x, y) => {
              const p = (priority[x.type] ?? 99) - (priority[y.type] ?? 99);
              if (p !== 0) return p;
              return x.d - y.d;
          });
          const best = candidates[0];
          snapPoint.copy(best.p);
          snapType = best.type;
          if (best.type === 'vertex') isVertex = true;
          if (best.type === 'edge') isEdge = true;
      }

      // Do NOT apply axis lock here so the hover cursor stays on the actual 3D surface
      return { point: snapPoint, isVertex: isVertex, isEdge: isEdge, snapType };
  },
  onMove(e, isDragging, isQuickTap = false) {
      if (!Viewer || !Viewer.camera || !Parser || !Parser.modelGroup) return;
      
      // Offset the raycast target up by 70 pixels on touch screens to bypass the thumb
      // Skip this offset during a quick tap so it snaps exactly where your finger poked
      let pointerY = e.clientY;
      if (e.pointerType === 'touch' && !isQuickTap) {
          pointerY -= 70;
      }
      
      const mouse = new THREE.Vector2((e.clientX/window.innerWidth)*2-1, -(pointerY/window.innerHeight)*2+1);
      const raycaster = new THREE.Raycaster(); 
      raycaster.setFromCamera(mouse, Viewer.camera);
      
      const visibleMeshes = [];
      if (Parser.modelGroup.children) {
          Parser.modelGroup.children.forEach(m => {
              if (m && m.visible) {
                  visibleMeshes.push(m);
              }
          });
      }
      
      const hits = raycaster.intersectObjects(Parser.modelGroup.children, true).filter(hit => {
          if (!hit.object.visible) return false;
          if (window.SectionManager && SectionManager.hasActiveClip()) {
              const planes = SectionManager.getActivePlanes();
              for (let i = 0; i < planes.length; i++) {
                  if (planes[i].distanceToPoint(hit.point) < 0) return false;
              }
          }
          return true;
      });
      let selectedHit = hits.length > 0 ? hits[0] : null;
      let snapData = null;
      
      if (selectedHit) {
          this.lastHit = selectedHit;
          snapData = this.getSnappedData(selectedHit);
      } else if (this.points.length === 1 && this.axisLock !== 'free') {
          // Allow measuring into empty space when an axis lock is active
          const plane = new THREE.Plane();
          const camDir = new THREE.Vector3();
          Viewer.camera.getWorldDirection(camDir);
          // Create an invisible plane facing the camera, anchored to Point A
          plane.setFromNormalAndCoplanarPoint(camDir.negate(), this.points[0]);
          const pt = new THREE.Vector3();
          
          if (raycaster.ray.intersectPlane(plane, pt)) {
              this.lastHit = { point: pt };
              snapData = { point: this.applyAxisLock(pt), isVertex: false, isEdge: false, snapType: 'empty' };
          }
      }

      if (snapData) {
          this.lastSnapData = snapData;

          if (App && App.tool === 'section-pick' && App.pickPlaneAxis) {
              document.getElementById(`cut-${App.pickPlaneAxis}-enable`).checked = true;
              SectionManager.onSlider(App.pickPlaneAxis, snapData.point[App.pickPlaneAxis]);
          }

          if (this.snapCursor) {
              this.snapCursor.position.copy(snapData.point);
              const basePoint = selectedHit && selectedHit.point ? selectedHit.point : (hits[0] ? hits[0].point : snapData.point);
              const s = Viewer.camera.position.distanceTo(basePoint) * 0.005;
              
              this.snapCursor.scale.set(s,s,s);
              this.snapCursor.lookAt(Viewer.camera.position);

              const faceColor = (this.axisLock !== 'free') ? 0x000000 : this.getAxisColor();
              const color = snapData.isVertex ? 0x1d4ed8 : snapData.isEdge ? 0x4fc3f7 : faceColor;

              if (this.cursorDefault) this.cursorDefault.material.color.setHex(color);
              const edgeHover = !!snapData && snapData.isEdge && !snapData.isVertex;
              this.cursorDefault.visible = !edgeHover;
              this.cursorEdgeHover.visible = edgeHover;

              this.snapCursor.visible = true;
          }

          if (this.mode === 'distance') {
              // Apply lock only to the line and readout, leaving the visual dot on the surface
              const displayPoint = this.applyAxisLock(snapData.point);
              if (this.points.length === 1) {
                  this.updatePreviewLine(displayPoint);
              } else if (this.points.length === 0) {
                  this.updateReadout(displayPoint);
              }
          }
          const cursor = document.getElementById('measure-cursor');
          if (cursor) {
              cursor.style.left = e.clientX + 'px';
              cursor.style.top = pointerY + 'px'; // Match the raycast offset
              cursor.style.transform = 'translate(-50%, -50%)'; // Center directly on the new target
              cursor.innerHTML = '<span class="material-icons">gps_fixed</span>';
              cursor.style.display = (App && App.tool === 'measure') ? 'flex' : 'none';
          }
          const mag = document.getElementById('magnifier-lens');
          if (mag) mag.style.display = 'none';
      } else {
          this.lastHit = null;
          this.lastSnapData = null;
          if (this.snapCursor) this.snapCursor.visible = false;
          this.clearPreviewLine();
          if (this.mode === 'distance' && !this.measurementLocked) {
              this.updateReadout();
          }
          const mag = document.getElementById('magnifier-lens');
          if (mag) mag.style.display = 'none';
      }
  },
  createLabel(htmlContent, positionVector, isCoord=false) {
      const el = document.createElement('div');
      el.className = 'measure-label' + (isCoord ? ' coord' : ''); 
      el.innerHTML = htmlContent;
      const container = document.getElementById('measure-labels-container');
      if (container) container.appendChild(el);
      this.labels.push({ el, pos: positionVector });
  },
  updatePreviewLine(targetPoint) {
      if (!this.points.length) return;
      
      const startPoint = this.points[0];
      const lineColor = this.getLineColor(startPoint, targetPoint);
      const distance = startPoint.distanceTo(targetPoint);
      
      // Halved the thickness multiplier and limits
      const distToCam = Viewer.camera.position.distanceTo(startPoint);
      const lineRadius = THREE.MathUtils.clamp(distToCam * 0.0015, 0.3, 2.0);
      
      if (!this.previewLine) {
          this.previewLine = new THREE.Group();
          this.previewLine.renderOrder = 999;
          
          const mat = new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 });
          
          const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
          cylGeo.translate(0, 0.5, 0);
          cylGeo.rotateX(Math.PI / 2);
          const lineMesh = new THREE.Mesh(cylGeo, mat);
          lineMesh.name = 'line';
          
          this.previewLine.add(lineMesh);
          
          this.group.add(this.previewLine);
      }
      
      this.previewLine.position.copy(startPoint);
      if (distance > 0.001) this.previewLine.lookAt(targetPoint);
      
      const lineMesh = this.previewLine.getObjectByName('line');
      
      lineMesh.scale.set(lineRadius, lineRadius, distance);
      
      // Ensure all children match the current axis color
      this.previewLine.traverse(child => {
          if (child.isMesh) child.material.color.setHex(lineColor);
      });
      
      this.updateReadout(targetPoint);
  },
  clearPreviewLine() {
      if (this.previewLine) {
          this.group.remove(this.previewLine);
          if (this.previewLine.isGroup) {
              this.previewLine.traverse(child => {
                  if (child.isMesh) child.geometry.dispose();
              });
          } else if (this.previewLine.geometry) {
              this.previewLine.geometry.dispose();
          }
          this.previewLine = null;
      }
      if (this.previewLabel) {
          this.previewLabel.el.remove();
          this.previewLabel = null;
      }
  },
  onClick(snapData) {
    if (!snapData) return;
    snapData.point = this.applyAxisLock(snapData.point);

    if (this.mode === 'distance' && this.measurementLocked) {
        this.clear();
        this.measurementLocked = false;
        // Function continues below to instantly register Point A
    }

    const distanceToCamera = Viewer.camera.position.distanceTo(snapData.point);
    const baseRadius = THREE.MathUtils.clamp(distanceToCamera * 0.016, 2.2, 5.4);
    const faceColor = (this.axisLock !== 'free') ? 0x000000 : this.getAxisColor();
    const markerColor = snapData.isVertex ? 0x1d4ed8 : snapData.isEdge ? 0x4fc3f7 : faceColor;

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(baseRadius * 2.1, 20, 20),
      new THREE.MeshBasicMaterial({ color: markerColor, transparent: true, opacity: 0.24, depthTest: false, depthWrite: false })
    );
    halo.position.copy(snapData.point);
    halo.renderOrder = 998;
    this.group.add(halo);

    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(baseRadius * 1.45, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false })
    );
    ring.position.copy(snapData.point);
    ring.renderOrder = 999;
    this.group.add(ring);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(baseRadius * 0.62, 20, 20),
      new THREE.MeshBasicMaterial({ color: markerColor, transparent: true, opacity: 1, depthTest: false, depthWrite: false })
    );
    marker.position.copy(snapData.point);
    marker.renderOrder = 1000;
    this.group.add(marker);
    this.markers.push({ marker, halo, ring });

    if(this.mode === 'coord') {
        const worldPt = snapData.point.clone().add(Parser.globalOffset);
        const txt = `<span style="color:#ef5350">X: ${worldPt.x.toFixed(1)}</span><br><span style="color:#66bb6a">Y: ${worldPt.y.toFixed(1)}</span><br><span style="color:#42a5f5">Z: ${worldPt.z.toFixed(1)}</span>`;
        this.createLabel(txt, snapData.point.clone(), true);
    } 
    else if (this.mode === 'distance') {
        this.points.push(snapData.point.clone());
        if (this.points.length === 1) {
            this.measurementLocked = false;
            this.updateReadout();
            // Removed updatePreviewLine so Point B remains blank until the mouse moves
        }
        if (this.points.length === 2) {
            const ptA = this.points[0];
            const ptB = this.points[1];
            const finalColor = this.getLineColor(ptA, ptB);
            const distance = ptA.distanceTo(ptB);
            
            // Halved thickness
            const distToCam = Viewer.camera.position.distanceTo(ptA);
            const lineRadius = THREE.MathUtils.clamp(distToCam * 0.0015, 0.3, 2.0);
            
            const group = new THREE.Group();
            group.renderOrder = 999;
            
            const mat = new THREE.MeshBasicMaterial({color: finalColor, depthTest: false});
            
            const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
            cylGeo.translate(0, 0.5, 0);
            cylGeo.rotateX(Math.PI / 2);
            const line = new THREE.Mesh(cylGeo, mat);
            line.scale.set(lineRadius, lineRadius, distance);
            group.add(line);
            
            group.position.copy(ptA);
            if (distance > 0.001) group.lookAt(ptB);
            
            this.group.add(group);
            this.measurementLocked = true;
            this.updateReadout();
            this.clearPreviewLine();
        }
    }
    this.updateLabelPos();
  },
  updateLabelPos() {
    this.labels.forEach(l => {
        const p = l.pos.clone().project(Viewer.camera);
        l.el.style.left = ((p.x * 0.5 + 0.5) * window.innerWidth) + 'px';
        l.el.style.top = ((-p.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    });
    if (this.previewLabel) {
        const p = this.previewLabel.pos.clone().project(Viewer.camera);
        this.previewLabel.el.style.left = ((p.x * 0.5 + 0.5) * window.innerWidth) + 'px';
        this.previewLabel.el.style.top = ((-p.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    }
  },
  clear() { 
      this.group.clear(); 
      this.points = []; 
      this.markers = []; 
      this.labels.forEach(l => l.el.remove());
      this.labels = [];
      this.clearPreviewLine();
      this.lastSnapData = null;
      this.lastHit = null;
      this.measurementLocked = false;
      this.ignoreNextPointerUp = false;
      if (App && App.touchPointerIds) App.touchPointerIds.clear();
      const panel = document.getElementById('measure-readout');
      if (panel) {
          const content = panel.querySelector('.measure-readout-content');
          if (content) {
              content.innerHTML = `
                  <div class="measure-readout-row"><span class="measure-readout-tag">A</span><span>--</span></div>
                  <div class="measure-readout-row"><span class="measure-readout-tag">B</span><span>--</span></div>
                  <div class="measure-readout-row total"><span class="measure-readout-tag">C</span><span class="measure-readout-value">-- mm</span></div>
              `;
          }
          panel.classList.add('hidden');
      }
      if (this.snapCursor) this.snapCursor.visible = false;
      const cursor = document.getElementById('measure-cursor');
      if (cursor) cursor.style.display = 'none';
      document.getElementById('magnifier-lens').style.display = 'none';
  }
};