import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Arrow, Group, Image as KonvaImage, Transformer, Circle } from 'react-konva';
import { gridLinePositions, snapPointToGrid } from './measurement';
import { useSvgImage, preloadIconRegistry } from './useSvgImage';
import RichTextToolbar from '../../components/ui/RichTextToolbar';

const ICON_SIZE = 56;
const NOTE_WIDTH = 140;
const NOTE_HEIGHT = 60;
const TEXT_LABEL_WIDTH = 160;
const TEXT_LABEL_HEIGHT = 32;
// Every 15° — matches the toolbar's ⟲/⟳ step buttons (StagePlotPageEditor.jsx),
// so the drag-handle and the buttons land on the same angles.
const ROTATION_SNAPS = Array.from({ length: 24 }, (_, i) => i * 15);
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

// Rotates an (x,y) offset by `deg` degrees around the origin — used to keep
// a rotated icon's label/number badge at a fixed position and orientation
// relative to the icon regardless of how the icon itself is rotated (see
// ElementShape's counter-rotated inner Groups below).
function rotateOffset(x, y, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// Renders a placed element as its real hand-authored icon (see
// iconRegistry.js/stagePlotIcons.js/floorPlanIcons.js) when the scene's
// `iconRegistry` prop has an entry for it — falling back to a plain
// labeled box for anything unregistered (e.g. the internal canvas-engine
// demo page's placeholder icon set), so this component works whether or
// not a real icon set is wired up.
function ElementShape({ element, icon, number, isSelected, isMultiSelected, onSelect, onEdit, onDragEnd, shapeRef }) {
  const image = useSvgImage(icon?.svg);
  // Icon, label, and number badge all live inside one draggable/transformable
  // Group instead of as separate top-level siblings — Konva moves/transforms
  // a Group's whole subtree as one unit natively, which is what keeps the
  // label glued to the icon during a live drag (previously the icon alone
  // was draggable and dragged via Konva's internal pointer transaction,
  // bypassing React — the label, bound to element.x/y as a React prop,
  // stayed frozen at the old position until onDragEnd finally re-rendered
  // it). Children are positioned relative to the Group's own (0,0) origin.
  const baseLabel = element.label || icon?.label || element.iconId || '';
  const labelText = element.seats ? `${baseLabel} (${element.seats})` : baseLabel;
  const labelY = icon ? ICON_SIZE / 2 + 12 : 24;
  // The label and number badge live inside the same rotatable Group as the
  // icon (see the file-level comment below) so they track drags correctly,
  // but readers shouldn't have to tilt their head to read a rotated icon's
  // name — counter-rotating these two inner Groups by the icon's own
  // rotation cancels the parent's spin, and rotating their *offset* by the
  // same amount keeps them anchored at the same fixed spot next to the
  // icon (below, and top-right) instead of orbiting around it as it turns.
  const counterRotation = -element.rotation;
  const labelAnchor = rotateOffset(0, labelY, counterRotation);
  const numberAnchor = rotateOffset(16, -24, counterRotation);

  return (
    <Group
      ref={shapeRef}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      scaleX={element.scaleX}
      scaleY={element.scaleY}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onEdit}
      onDblTap={onEdit}
      onDragEnd={(e) => onDragEnd(element.id, { x: e.target.x(), y: e.target.y() })}
    >
      {isMultiSelected && (
        <Rect
          width={ICON_SIZE + 10}
          height={ICON_SIZE + 10}
          offsetX={(ICON_SIZE + 10) / 2}
          offsetY={(ICON_SIZE + 10) / 2}
          stroke="#4f46e5"
          strokeWidth={1.5}
          dash={[4, 3]}
          cornerRadius={6}
          listening={false}
        />
      )}
      {icon && image ? (
        <KonvaImage
          image={image}
          width={ICON_SIZE}
          height={ICON_SIZE}
          offsetX={ICON_SIZE / 2}
          offsetY={ICON_SIZE / 2}
          shadowColor={isSelected ? '#4f46e5' : undefined}
          shadowBlur={isSelected ? 8 : 0}
          shadowOpacity={isSelected ? 0.6 : 0}
        />
      ) : (
        <Rect
          width={40}
          height={40}
          offsetX={20}
          offsetY={20}
          fill={isSelected ? '#c7d2fe' : '#e2e8f0'}
          stroke={isSelected ? '#4f46e5' : '#94a3b8'}
          strokeWidth={2}
          cornerRadius={4}
        />
      )}
      <Group x={labelAnchor.x} y={labelAnchor.y} rotation={counterRotation} listening={false}>
        <Text
          x={-34}
          y={0}
          text={labelText}
          fontSize={10}
          fill="#334155"
          width={68}
          align="center"
        />
      </Group>
      {number != null && (
        <Group x={numberAnchor.x} y={numberAnchor.y} rotation={counterRotation} listening={false}>
          <Circle radius={9} fill="#4f46e5" stroke="#fff" strokeWidth={1.5} />
          <Text
            text={String(number)}
            fontSize={10}
            fontStyle="bold"
            fill="#fff"
            width={18}
            height={18}
            offsetX={9}
            offsetY={9}
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )}
    </Group>
  );
}

// A "sticky note" — background card + wrapped text, editable in place via
// an HTML textarea overlay (see the parent's editingAnnotationId/renders
// below Stage). Rendered as a Group positioned at its top-left corner
// (not centered like ElementShape) so its on-screen box lines up exactly
// with the textarea overlay used to edit it.
function AnnotationNote({ annotation, isSelected, isEditing, onSelect, onEdit, onDragEnd }) {
  if (isEditing) return null; // the HTML textarea overlay stands in while editing
  const hasText = !!annotation.text?.trim();
  const groupProps = {
    x: annotation.x,
    y: annotation.y,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDblClick: onEdit,
    onDblTap: onEdit,
    onDragEnd: (e) => onDragEnd(annotation.id, { x: e.target.x(), y: e.target.y() }),
  };

  // 'text' style: a free-floating label (zone/area labels like "FOH" or
  // "Green Room") — no card background, auto-sized to its content (no
  // `width` given to Konva's Text lets it size itself rather than wrap).
  if (annotation.style === 'text') {
    return (
      <Group {...groupProps}>
        <Text
          text={hasText ? annotation.text : 'Double-click to edit…'}
          fontSize={14}
          fill={isSelected ? '#4f46e5' : hasText ? '#1e293b' : '#94a3b8'}
          fontStyle={hasText ? 'normal' : 'italic'}
          padding={4}
        />
      </Group>
    );
  }

  return (
    <Group {...groupProps}>
      <Rect
        width={NOTE_WIDTH}
        height={NOTE_HEIGHT}
        fill="#fef9c3"
        stroke={isSelected ? '#4f46e5' : '#eab308'}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={4}
        shadowColor="#000"
        shadowBlur={isSelected ? 5 : 2}
        shadowOpacity={0.15}
      />
      <Text
        text={hasText ? annotation.text : 'Double-click to edit…'}
        fontSize={12}
        fill={hasText ? '#78350f' : '#a16207'}
        fontStyle={hasText ? 'normal' : 'italic'}
        x={7}
        y={7}
        width={NOTE_WIDTH - 14}
        height={NOTE_HEIGHT - 14}
        wrap="word"
        ellipsis
      />
    </Group>
  );
}

// The shared Stage/Layer wrapper every canvas tool (Stage Plot, Floor Plan)
// renders on top of. Owns pan/zoom, grid rendering, drag-from-palette
// placement, and free-form select/move/transform — never owns the scene
// data itself (that's history.js/sceneModel.js in the parent).
//
// `onMutate(mutatorFn)` applies a mutator from sceneModel.js against the
// current scene (routes to history.apply — pushes an undo step).
// `onAdjust(mutatorFn)` is the same but for in-place, non-undo-worthy tweaks
// (routes to history.replaceCurrent).
//
// forwardRef exposes `{ fitToContent }` — separate from the `stageRef` prop
// below (which hands the caller the raw Konva Stage node for things like
// thumbnail capture). This ref is for the React component's own actions, so
// a real toolbar button in the parent (not just the small zoom-control
// widget in the corner here) can trigger the same "show me everything" fit.
const CanvasStage = forwardRef(function CanvasStage({
  scene,
  onMutate,
  onAdjust,
  width = 900,
  height = 600,
  showGrid = true,
  snapEnabled = true,
  mode = 'select', // 'select' | 'draw' | 'note' | 'text' | 'arrow' | 'place-icon' | 'calibrate'
  strokeColor = '#1e293b',
  selectedElementId,
  onSelectElement,
  multiSelectedIds,
  selectedAnnotationId,
  onSelectAnnotation,
  selectedStrokeId,
  onSelectStroke,
  stageRef,
  iconRegistry,
  elementNumbers,
  elementContent,
  onUpdateElementContent,
  onElementAdded,
  pendingIconId,
  onCalibrate,
}, ref) {
  const internalStageRef = useRef(null);
  const trRef = useRef(null);
  const shapeRefs = useRef({});
  const editTextareaRef = useRef(null);
  const nameInputRef = useRef(null);
  const descriptionEditRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [drawingPoints, setDrawingPoints] = useState(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [editingElementId, setEditingElementId] = useState(null);
  const [editingElementRect, setEditingElementRect] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescriptionHtml, setDraftDescriptionHtml] = useState('');
  const [liveRotation, setLiveRotation] = useState(null);
  const [calibrationPoints, setCalibrationPoints] = useState(null);
  const [calibrationDistance, setCalibrationDistance] = useState('');
  const [isPanning, setIsPanning] = useState(false);

  // Decode every registered icon once up front rather than lazily on first
  // placement — without this, the *first* time any given icon type is
  // dragged onto the canvas it briefly renders as a plain placeholder box
  // while its SVG decodes, then pops to the real icon. Cheap (icons are
  // small inline SVGs) and only ever runs once per icon set per mount.
  useEffect(() => {
    preloadIconRegistry(iconRegistry);
  }, [iconRegistry]);

  // Konva's Stage focuses its own container div on pointerdown (for its
  // keyboard-shortcut support), which races the just-opened note textarea's
  // own focus — Konva's steal wins if we focus synchronously, firing our
  // onBlur before the user ever types and deleting the note we just made.
  // Deferring to the next animation frame lets Konva's focus land first, so
  // ours reliably wins and sticks.
  useEffect(() => {
    if (!editingAnnotationId) return;
    const raf = requestAnimationFrame(() => editTextareaRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [editingAnnotationId]);

  // Same Konva-focus-steal race as the note textarea above, for the icon
  // popup's Name field (the first thing a user would want to type into).
  useEffect(() => {
    if (!editingElementId) return;
    const raf = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [editingElementId]);

  // contentEditable isn't a controlled input — its content has to be set
  // imperatively when a new editing session starts (same pattern as every
  // other RichTextToolbar usage in this app, e.g. PrepEmailModal.jsx).
  // Deliberately only keyed on editingElementId, not draftDescriptionHtml —
  // syncing on every keystroke would reset the cursor to the start on each
  // one, since onInput below is what drives draftDescriptionHtml in the
  // first place.
  useEffect(() => {
    if (editingElementId && descriptionEditRef.current) {
      descriptionEditRef.current.innerHTML = draftDescriptionHtml;
    }
  }, [editingElementId]);

  function assignStageRef(node) {
    internalStageRef.current = node;
    if (stageRef) stageRef.current = node;
  }

  // Attach/detach the Transformer to whichever shape is currently selected.
  // Also re-runs on scene.layers — hiding the selected element's layer
  // unmounts its Konva node (shapeRefs.current[id] goes stale/undefined),
  // and without layers in the dep list this effect wouldn't re-fire to
  // notice, leaving orphaned transform handles with nothing attached.
  useEffect(() => {
    const node = selectedElementId ? shapeRefs.current[selectedElementId] : null;
    if (trRef.current) {
      trRef.current.nodes(node ? [node] : []);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selectedElementId, scene.elements, scene.layers]);

  // Zooms toward a specific screen point (`anchor`, the canvas center) so
  // that point doesn't visually jump — used only by the toolbar zoom
  // buttons below. Deliberately no scroll-wheel/trackpad zoom binding: it
  // was reported as accidental and hard to control, hijacking normal page
  // scroll the moment the pointer happened to be over the canvas. Buttons
  // are the only way to zoom now.
  function zoomToward(newScaleRaw, anchor) {
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScaleRaw));
    const scenePoint = { x: (anchor.x - stagePos.x) / zoom, y: (anchor.y - stagePos.y) / zoom };
    setZoom(newScale);
    setStagePos({ x: anchor.x - scenePoint.x * newScale, y: anchor.y - scenePoint.y * newScale });
  }

  function handleZoomButton(factor) {
    zoomToward(zoom * factor, { x: width / 2, y: height / 2 });
  }

  // The zoom "reset" used to just snap back to a fixed 100%/origin — no
  // help if the plot is naturally wider than the canvas even at 100%, and
  // no way back to "I can see everything" once zoomed into a corner with
  // no panning available. Computes the real bounding box of everything
  // placed (elements, notes/text, freehand strokes) and fits it in view
  // instead — the actual "I'm lost, show me the whole plot" escape hatch.
  // Never zooms IN past 100% for a small scene (e.g. one lone icon) — only
  // zooms out as far as needed for a large one.
  function handleFitToContent() {
    const points = [];
    for (const el of scene.elements) {
      points.push({ x: el.x - ICON_SIZE, y: el.y - ICON_SIZE }, { x: el.x + ICON_SIZE, y: el.y + ICON_SIZE });
    }
    for (const a of scene.annotations) {
      const w = a.style === 'text' ? TEXT_LABEL_WIDTH : NOTE_WIDTH;
      const h = a.style === 'text' ? TEXT_LABEL_HEIGHT : NOTE_HEIGHT;
      points.push({ x: a.x, y: a.y }, { x: a.x + w, y: a.y + h });
    }
    for (const s of scene.strokes) {
      for (let i = 0; i < s.points.length; i += 2) points.push({ x: s.points[i], y: s.points[i + 1] });
    }

    if (!points.length) {
      setZoom(1);
      setStagePos({ x: 0, y: 0 });
      return;
    }

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const FIT_PADDING = 40;
    const newZoom = Math.max(MIN_ZOOM, Math.min(1, Math.min(
      (width - FIT_PADDING * 2) / Math.max(maxX - minX, 1),
      (height - FIT_PADDING * 2) / Math.max(maxY - minY, 1),
    )));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(newZoom);
    setStagePos({ x: width / 2 - centerX * newZoom, y: height / 2 - centerY * newZoom });
  }

  useImperativeHandle(ref, () => ({ fitToContent: handleFitToContent }));

  // Scene coordinates from a point already in Konva's own pointer-position
  // space (container-relative CSS pixels, pre-pan/zoom) — used for every
  // interaction driven through Konva's own event system (mouse down/move,
  // stage clicks). Deliberately NOT routed through the DOM's
  // getBoundingClientRect() — Konva's getPointerPosition() already strips
  // that out, so re-adding and re-subtracting the container's page offset
  // (the previous implementation) was redundant and a needless source of
  // desync if the container ever moved mid-gesture (e.g. a scroll).
  function stagePointToScene({ x, y }) {
    const sx = (x - stagePos.x) / zoom;
    const sy = (y - stagePos.y) / zoom;
    return snapEnabled ? snapPointToGrid({ x: sx, y: sy }, scene.scalePxPerUnit, scene.gridSpacing) : { x: sx, y: sy };
  }

  // Scene coordinates from genuine page/client coordinates (clientX/clientY)
  // — only the native HTML5 drag-and-drop `drop` event needs this, since
  // that's a plain DOM event with no Konva pointer-position equivalent.
  function toSceneCoords(clientX, clientY) {
    const rect = internalStageRef.current.container().getBoundingClientRect();
    return stagePointToScene({ x: clientX - rect.left, y: clientY - rect.top });
  }

  function handleDrop(e) {
    e.preventDefault();
    const iconId = e.dataTransfer.getData('application/x-canvas-icon');
    if (!iconId) return;
    const { x, y } = toSceneCoords(e.clientX, e.clientY);
    const label = iconRegistry?.[iconId]?.label || iconId;
    const element = {
      id: `el_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`,
      layerId: scene.layers.find((l) => !l.locked)?.id || scene.layers[0]?.id,
      iconId, x, y, rotation: 0, scaleX: 1, scaleY: 1, label,
    };
    onMutate((s) => ({ ...s, elements: [...s.elements, element] }));
    onElementAdded?.(element);
  }

  function startEditingAnnotation(annotation) {
    setDraftText(annotation.text || '');
    setEditingAnnotationId(annotation.id);
  }

  // Commits the textarea overlay's content back into the scene — deletes
  // the annotation instead of saving empty text, so canceling out of a
  // just-created note (or clearing an old one) doesn't leave an invisible
  // blank sticky note behind.
  function commitEditingAnnotation() {
    const id = editingAnnotationId;
    if (!id) return;
    const text = draftText.trim();
    setEditingAnnotationId(null);
    onMutate((s) => (text
      ? { ...s, annotations: s.annotations.map((a) => (a.id === id ? { ...a, text: draftText } : a)) }
      : { ...s, annotations: s.annotations.filter((a) => a.id !== id) }));
  }

  // Anchors the popup to the icon's actual on-screen box (rotation/scale
  // aware, via Konva's own getClientRect) rather than its raw scene x/y —
  // an icon can be rotated via the toolbar's ⟲/⟳ buttons, and a fixed
  // offset from the unrotated origin would visibly drift off the icon once
  // rotated. relativeTo the Stage itself excludes the Stage's own pan/zoom
  // transform (so this comes back in the same scene-coordinate space as
  // element.x/y), which is then converted to screen position the same way
  // the note textarea overlay already does, below.
  function startEditingElement(elementId) {
    const node = shapeRefs.current[elementId];
    if (!node || !internalStageRef.current) return;
    setEditingElementRect(node.getClientRect({ relativeTo: internalStageRef.current }));
    const existing = elementContent?.[elementId];
    setDraftName(existing?.name || '');
    setDraftDescriptionHtml(existing?.description || '');
    setEditingElementId(elementId);
  }

  // Only actually calls onUpdateElementContent if there's something to
  // save (new content typed) or something to update (content already
  // existed) — opening and closing the popup on an icon with nothing typed
  // shouldn't silently create/number a channel or list row for it.
  function commitEditingElement() {
    const id = editingElementId;
    if (!id) return;
    setEditingElementId(null);
    const hadExisting = !!elementContent?.[id];
    const nameTrimmed = draftName.trim();
    const descriptionTextOnly = draftDescriptionHtml.replace(/<[^>]*>/g, '').trim();
    if (hadExisting || nameTrimmed || descriptionTextOnly) {
      onUpdateElementContent?.(id, { name: draftName, description: draftDescriptionHtml });
    }
  }

  function handleStageMouseDown(e) {
    const clickedEmptyCanvas = e.target === e.target.getStage();

    if (mode === 'note' || mode === 'text') {
      if (!clickedEmptyCanvas) return; // let the existing shape's own click/dblclick handle it
      const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
      const id = `note_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`;
      const style = mode === 'text' ? 'text' : 'note';
      onMutate((s) => ({
        ...s,
        annotations: [...s.annotations, { id, layerId: s.layers.find((l) => !l.locked)?.id || s.layers[0]?.id, x, y, text: '', style }],
      }));
      setDraftText('');
      setEditingAnnotationId(id);
      return;
    }

    // Click-to-place — the touch-friendly alternative to dragging from the
    // palette (native HTML5 drag-and-drop doesn't exist on touch devices at
    // all). Tapping a palette icon arms `pendingIconId`; every tap on the
    // canvas after that places a copy, same as a drop would, and stays
    // armed so placing several of the same icon doesn't mean re-tapping the
    // palette each time — mirrors how the Note/Text/Arrow tools already work.
    if (mode === 'place-icon') {
      if (!clickedEmptyCanvas || !pendingIconId) return;
      const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
      const label = iconRegistry?.[pendingIconId]?.label || pendingIconId;
      const element = {
        id: `el_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`,
        layerId: scene.layers.find((l) => !l.locked)?.id || scene.layers[0]?.id,
        iconId: pendingIconId, x, y, rotation: 0, scaleX: 1, scaleY: 1, label,
      };
      onMutate((s) => ({ ...s, elements: [...s.elements, element] }));
      onElementAdded?.(element);
      return;
    }

    if (mode === 'arrow' || mode === 'calibrate') {
      const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
      setDrawingPoints([x, y, x, y]);
      return;
    }

    if (mode !== 'draw') {
      if (clickedEmptyCanvas) {
        onSelectElement?.(null);
        onSelectAnnotation?.(null);
        onSelectStroke?.(null);
      }
      return;
    }

    const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
    setDrawingPoints([x, y]);
  }

  function handleStageMouseMove() {
    if (!drawingPoints) return;
    const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
    if (mode === 'arrow' || mode === 'calibrate') {
      // Two points only (start, live end) — replaces the end point on every
      // move, unlike 'draw' below which appends every sampled point to
      // build up a freehand path.
      setDrawingPoints((prev) => [prev[0], prev[1], x, y]);
      return;
    }
    if (mode !== 'draw') return;
    setDrawingPoints((prev) => [...prev, x, y]);
  }

  function confirmCalibration() {
    const distance = Number(calibrationDistance);
    if (calibrationPoints && distance > 0) {
      onCalibrate?.(calibrationPoints.a, calibrationPoints.b, distance);
    }
    setCalibrationPoints(null);
    setCalibrationDistance('');
  }

  function cancelCalibration() {
    setCalibrationPoints(null);
    setCalibrationDistance('');
  }

  function handleStageMouseUp() {
    if (!drawingPoints) return;
    if (mode === 'arrow') {
      const isRealDrag = drawingPoints[0] !== drawingPoints[2] || drawingPoints[1] !== drawingPoints[3];
      if (isRealDrag) {
        onMutate((s) => ({
          ...s,
          strokes: [...s.strokes, {
            id: `stroke_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`,
            layerId: s.layers[0]?.id,
            points: drawingPoints,
            color: strokeColor,
            strokeWidth: 2,
            kind: 'arrow',
          }],
        }));
      }
      setDrawingPoints(null);
      return;
    }
    // "Set Scale": click two points a known real-world distance apart —
    // finalizes into a floating distance-input popup (rendered below)
    // rather than a permanent scene element, since a calibration measurement
    // isn't part of the plot itself.
    if (mode === 'calibrate') {
      const isRealDrag = drawingPoints[0] !== drawingPoints[2] || drawingPoints[1] !== drawingPoints[3];
      if (isRealDrag) {
        setCalibrationPoints({ a: { x: drawingPoints[0], y: drawingPoints[1] }, b: { x: drawingPoints[2], y: drawingPoints[3] } });
        setCalibrationDistance('');
      }
      setDrawingPoints(null);
      return;
    }
    if (mode !== 'draw') return;
    if (drawingPoints.length >= 4) {
      onMutate((s) => ({
        ...s,
        strokes: [...s.strokes, {
          id: `stroke_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`,
          layerId: s.layers[0]?.id,
          points: drawingPoints,
          color: strokeColor,
          strokeWidth: 2,
          kind: 'line',
        }],
      }));
    }
    setDrawingPoints(null);
  }

  const grid = showGrid ? gridLinePositions(width * 3, height * 3, scene.scalePxPerUnit, scene.gridSpacing) : { vertical: [], horizontal: [] };
  const visibleLayerIds = new Set(scene.layers.filter((l) => l.visible).map((l) => l.id));
  const editingAnnotation = editingAnnotationId ? scene.annotations.find((a) => a.id === editingAnnotationId) : null;
  const selectedElement = selectedElementId ? scene.elements.find((e) => e.id === selectedElementId) : null;

  return (
    <div
      className="relative shrink-0 border border-slate-200 rounded-lg overflow-hidden bg-white"
      style={{
        width,
        height,
        cursor: mode === 'note' || mode === 'text' || mode === 'place-icon' ? 'copy'
          : mode === 'draw' || mode === 'arrow' || mode === 'calibrate' ? 'crosshair'
          : mode === 'select' ? (isPanning ? 'grabbing' : 'grab')
          : 'default',
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Stage
        ref={assignStageRef}
        width={width}
        height={height}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePos.x}
        y={stagePos.y}
        // Only draggable in select mode — Konva targets whatever node the
        // drag actually started on, so this only pans when the gesture
        // starts on empty canvas; starting on a placed icon still drags
        // that icon (its own Group is separately draggable). Synced back
        // into stagePos on every move, not just at the end — a controlled
        // x/y prop that only updates on dragend can otherwise get yanked
        // back mid-drag by an unrelated re-render, fighting Konva's own
        // internal position.
        draggable={mode === 'select'}
        onDragStart={() => setIsPanning(true)}
        onDragMove={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
        onDragEnd={(e) => { setStagePos({ x: e.target.x(), y: e.target.y() }); setIsPanning(false); }}
        // No zoom logic here anymore (buttons only, per feedback that
        // scroll-to-zoom was hard to control) — but still swallowing the
        // event, not removing the handler outright. Without this, a wheel
        // gesture over the canvas falls through to the browser's default
        // behavior and scrolls the *page*, not the canvas — which silently
        // moves the canvas out from under itself and desyncs anything
        // relying on its on-screen position.
        onWheel={(e) => e.evt.preventDefault()}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer listening={false}>
          {grid.vertical.map((x) => (
            <Line key={`v${x}`} points={[x, 0, x, height * 3]} stroke="#f1f5f9" strokeWidth={1} />
          ))}
          {grid.horizontal.map((y) => (
            <Line key={`h${y}`} points={[0, y, width * 3, y]} stroke="#f1f5f9" strokeWidth={1} />
          ))}
        </Layer>

        <Layer>
          {scene.strokes.filter((s) => visibleLayerIds.has(s.layerId)).map((s) => {
            const isSelectedStroke = s.id === selectedStrokeId;
            const resolvedColor = isSelectedStroke ? '#4f46e5' : s.color;
            const resolvedWidth = isSelectedStroke ? s.strokeWidth + 1 : s.strokeWidth;
            const common = {
              points: s.points,
              stroke: resolvedColor,
              strokeWidth: resolvedWidth,
              lineCap: 'round',
              lineJoin: 'round',
              // Thin strokes are hard to click precisely — widens the
              // invisible hit-test area without changing how the line
              // actually looks, so selecting one to delete it is reliable.
              hitStrokeWidth: Math.max(s.strokeWidth, 16),
              onClick: () => { if (mode === 'select') { onSelectStroke?.(s.id); onSelectElement?.(null); onSelectAnnotation?.(null); } },
              onTap: () => { if (mode === 'select') { onSelectStroke?.(s.id); onSelectElement?.(null); onSelectAnnotation?.(null); } },
            };
            return s.kind === 'arrow' ? (
              <Arrow key={s.id} {...common} fill={resolvedColor} pointerLength={isSelectedStroke ? 12 : 10} pointerWidth={isSelectedStroke ? 12 : 10} />
            ) : (
              <Line key={s.id} {...common} tension={0.4} />
            );
          })}
          {drawingPoints && (mode === 'arrow' ? (
            <Arrow points={drawingPoints} stroke={strokeColor} fill={strokeColor} strokeWidth={2} lineCap="round" lineJoin="round" pointerLength={10} pointerWidth={10} />
          ) : mode === 'calibrate' ? (
            <Line points={drawingPoints} stroke="#4f46e5" strokeWidth={2} dash={[6, 4]} lineCap="round" />
          ) : (
            <Line points={drawingPoints} stroke={strokeColor} strokeWidth={2} lineCap="round" lineJoin="round" tension={0.4} />
          ))}
          {calibrationPoints && (
            <Line
              points={[calibrationPoints.a.x, calibrationPoints.a.y, calibrationPoints.b.x, calibrationPoints.b.y]}
              stroke="#4f46e5"
              strokeWidth={2}
              dash={[6, 4]}
              lineCap="round"
              listening={false}
            />
          )}

          {scene.elements.filter((el) => visibleLayerIds.has(el.layerId)).map((el) => (
            <ElementShape
              key={el.id}
              element={el}
              icon={iconRegistry?.[el.iconId]}
              number={elementNumbers?.[el.id]}
              isSelected={el.id === selectedElementId}
              isMultiSelected={!!multiSelectedIds?.has(el.id)}
              onSelect={(e) => {
                const shiftKey = !!e?.evt?.shiftKey;
                onSelectElement?.(el.id, shiftKey);
                if (!shiftKey) { onSelectAnnotation?.(null); onSelectStroke?.(null); }
              }}
              onEdit={() => startEditingElement(el.id)}
              onDragEnd={(id, pos) => onMutate((s) => ({
                ...s,
                elements: s.elements.map((e) => (e.id === id ? { ...e, ...(snapEnabled ? snapPointToGrid(pos, s.scalePxPerUnit, s.gridSpacing) : pos) } : e)),
              }))}
              shapeRef={(node) => { if (node) shapeRefs.current[el.id] = node; else delete shapeRefs.current[el.id]; }}
            />
          ))}

          {scene.annotations.filter((a) => visibleLayerIds.has(a.layerId)).map((a) => (
            <AnnotationNote
              key={a.id}
              annotation={a}
              isSelected={a.id === selectedAnnotationId}
              isEditing={a.id === editingAnnotationId}
              onSelect={() => { onSelectAnnotation?.(a.id); onSelectElement?.(null); onSelectStroke?.(null); }}
              onEdit={() => startEditingAnnotation(a)}
              onDragEnd={(id, pos) => onAdjust((s) => ({
                ...s,
                annotations: s.annotations.map((an) => (an.id === id ? { ...an, ...pos } : an)),
              }))}
            />
          ))}

          {liveRotation != null && selectedElement && (
            <Group x={selectedElement.x} y={selectedElement.y - ICON_SIZE / 2 - 26} listening={false}>
              <Rect width={44} height={20} offsetX={22} offsetY={10} fill="#1e293b" cornerRadius={4} />
              <Text
                text={`${liveRotation}°`}
                fontSize={12}
                fill="#fff"
                width={44}
                height={20}
                offsetX={22}
                offsetY={10}
                align="center"
                verticalAlign="middle"
              />
            </Group>
          )}

          <Transformer
            ref={trRef}
            rotateEnabled
            rotationSnaps={ROTATION_SNAPS}
            onTransform={() => {
              // Only the rotate handle gets a live readout — resize-handle
              // drags fire onTransform too, and would otherwise flash a
              // stale/misleading angle label during a plain resize.
              if (trRef.current?.getActiveAnchor() !== 'rotater') return;
              const node = selectedElementId ? shapeRefs.current[selectedElementId] : null;
              if (node) setLiveRotation(Math.round(node.rotation()));
            }}
            onTransformEnd={() => {
              const node = selectedElementId ? shapeRefs.current[selectedElementId] : null;
              setLiveRotation(null);
              if (!node) return;
              onMutate((s) => ({
                ...s,
                elements: s.elements.map((e) => (e.id === selectedElementId
                  ? { ...e, x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() }
                  : e)),
              }));
            }}
          />
        </Layer>
      </Stage>

      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-white/95 backdrop-blur rounded-lg border border-slate-200 shadow-sm px-1 py-1">
        <button
          type="button"
          onClick={() => handleZoomButton(1 / 1.25)}
          data-testid="canvas-zoom-out-button"
          title="Zoom out"
          className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 text-base leading-none"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleFitToContent}
          data-testid="canvas-zoom-reset-button"
          title="Fit everything in view"
          className="w-12 text-center text-xs text-slate-500 hover:text-indigo-600 tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => handleZoomButton(1.25)}
          data-testid="canvas-zoom-in-button"
          title="Zoom in"
          className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 text-base leading-none"
        >
          +
        </button>
      </div>

      {editingAnnotation && (
        <textarea
          ref={editTextareaRef}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitEditingAnnotation}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.currentTarget.blur(); }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
          }}
          data-testid="canvas-annotation-textarea"
          className={editingAnnotation.style === 'text'
            ? 'absolute rounded border border-dashed border-indigo-400 bg-white/90 text-slate-800 text-sm px-1.5 py-1 resize-none outline-none whitespace-nowrap overflow-x-auto'
            : 'absolute rounded border-2 border-indigo-500 bg-yellow-50 text-amber-900 text-xs p-1.5 resize-none outline-none'}
          style={{
            left: editingAnnotation.x * zoom + stagePos.x,
            top: editingAnnotation.y * zoom + stagePos.y,
            width: (editingAnnotation.style === 'text' ? TEXT_LABEL_WIDTH : NOTE_WIDTH) * zoom,
            height: (editingAnnotation.style === 'text' ? TEXT_LABEL_HEIGHT : NOTE_HEIGHT) * zoom,
          }}
        />
      )}

      {calibrationPoints && (
        <div
          className="absolute z-10 bg-white rounded-lg border border-slate-300 shadow-lg p-3 w-64"
          style={{
            left: calibrationPoints.b.x * zoom + stagePos.x,
            top: calibrationPoints.b.y * zoom + stagePos.y + 10,
          }}
          onKeyDown={(e) => { if (e.key === 'Escape') cancelCalibration(); }}
        >
          <div className="text-xs font-semibold text-slate-500 mb-2">Real-world distance between these two points</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="any"
              autoFocus
              value={calibrationDistance}
              onChange={(e) => setCalibrationDistance(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmCalibration(); }}
              data-testid="canvas-calibration-distance-input"
              className="w-16 px-2 py-1 rounded border border-slate-300 text-sm outline-none focus:border-indigo-400"
            />
            <span className="text-sm text-slate-500">{scene.unit}</span>
            <button
              type="button"
              onClick={confirmCalibration}
              data-testid="canvas-calibration-confirm-button"
              className="ml-auto px-2 py-1 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              Set
            </button>
            <button type="button" onClick={cancelCalibration} className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {editingElementId && editingElementRect && (
        <div
          className="absolute z-10 bg-white rounded-lg border border-slate-300 shadow-lg p-3 w-72"
          style={{
            left: editingElementRect.x * zoom + stagePos.x,
            top: (editingElementRect.y + editingElementRect.height) * zoom + stagePos.y + 6,
          }}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) commitEditingElement(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') commitEditingElement(); }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Icon Details</span>
            <button
              type="button"
              onClick={commitEditingElement}
              data-testid="canvas-element-popup-close-button"
              className="text-slate-400 hover:text-slate-600 text-sm leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <input
            ref={nameInputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Name"
            data-testid="canvas-element-popup-name-input"
            className="w-full px-2 py-1.5 mb-2 rounded border border-slate-300 text-sm outline-none focus:border-indigo-400"
          />
          <RichTextToolbar editorRef={descriptionEditRef} onFormat={() => setDraftDescriptionHtml(descriptionEditRef.current?.innerHTML || '')} />
          <div
            ref={descriptionEditRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => setDraftDescriptionHtml(descriptionEditRef.current?.innerHTML || '')}
            data-testid="canvas-element-popup-description-input"
            className="w-full min-h-[70px] max-h-40 overflow-y-auto px-2 py-1.5 rounded border border-slate-300 text-sm outline-none focus:border-indigo-400"
          />
        </div>
      )}
    </div>
  );
});

export default CanvasStage;
