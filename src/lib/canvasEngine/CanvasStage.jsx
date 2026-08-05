import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Group, Image as KonvaImage, Transformer } from 'react-konva';
import { gridLinePositions, snapPointToGrid } from './measurement';
import { useSvgImage, preloadIconRegistry } from './useSvgImage';

const ICON_SIZE = 44;
const NOTE_WIDTH = 140;
const NOTE_HEIGHT = 60;

// Renders a placed element as its real hand-authored icon (see
// iconRegistry.js/stagePlotIcons.js/floorPlanIcons.js) when the scene's
// `iconRegistry` prop has an entry for it — falling back to a plain
// labeled box for anything unregistered (e.g. the internal canvas-engine
// demo page's placeholder icon set), so this component works whether or
// not a real icon set is wired up.
function ElementShape({ element, icon, isSelected, onSelect, onDragEnd, shapeRef }) {
  const image = useSvgImage(icon?.svg);
  const common = {
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e) => onDragEnd(element.id, { x: e.target.x(), y: e.target.y() }),
  };
  const labelText = element.label || icon?.label || element.iconId || '';

  return (
    <>
      {icon && image ? (
        <KonvaImage
          ref={shapeRef}
          {...common}
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
          ref={shapeRef}
          {...common}
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
      <Text
        x={element.x}
        y={element.y}
        text={labelText}
        fontSize={10}
        fill="#334155"
        offsetX={34}
        offsetY={icon ? -(ICON_SIZE / 2 + 12) : -24}
        width={68}
        align="center"
        listening={false}
      />
    </>
  );
}

// A "sticky note" — background card + wrapped text, editable in place via
// an HTML textarea overlay (see the parent's editingAnnotationId/renders
// below Stage). Rendered as a Group positioned at its top-left corner
// (not centered like ElementShape) so its on-screen box lines up exactly
// with the textarea overlay used to edit it.
function AnnotationNote({ annotation, isSelected, isEditing, onSelect, onEdit, onDragEnd }) {
  if (isEditing) return null; // the HTML textarea overlay stands in while editing
  return (
    <Group
      x={annotation.x}
      y={annotation.y}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onEdit}
      onDblTap={onEdit}
      onDragEnd={(e) => onDragEnd(annotation.id, { x: e.target.x(), y: e.target.y() })}
    >
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
        text={annotation.text?.trim() ? annotation.text : 'Double-click to edit…'}
        fontSize={12}
        fill={annotation.text?.trim() ? '#78350f' : '#a16207'}
        fontStyle={annotation.text?.trim() ? 'normal' : 'italic'}
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
export default function CanvasStage({
  scene,
  onMutate,
  onAdjust,
  width = 900,
  height = 600,
  showGrid = true,
  snapEnabled = true,
  mode = 'select', // 'select' | 'draw' | 'note'
  strokeColor = '#1e293b',
  selectedElementId,
  onSelectElement,
  selectedAnnotationId,
  onSelectAnnotation,
  stageRef,
  iconRegistry,
}) {
  const internalStageRef = useRef(null);
  const trRef = useRef(null);
  const shapeRefs = useRef({});
  const editTextareaRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [drawingPoints, setDrawingPoints] = useState(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState(null);
  const [draftText, setDraftText] = useState('');

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

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage = internalStageRef.current;
    const oldScale = zoom;
    const pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - stagePos.x) / oldScale, y: (pointer.y - stagePos.y) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.max(0.25, Math.min(4, direction > 0 ? oldScale * 1.1 : oldScale / 1.1));
    setZoom(newScale);
    setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  }

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
    onMutate((s) => ({
      ...s,
      elements: [...s.elements, {
        id: `el_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`,
        layerId: s.layers.find((l) => !l.locked)?.id || s.layers[0]?.id,
        iconId, x, y, rotation: 0, scaleX: 1, scaleY: 1, label,
      }],
    }));
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

  function handleStageMouseDown(e) {
    const clickedEmptyCanvas = e.target === e.target.getStage();

    if (mode === 'note') {
      if (!clickedEmptyCanvas) return; // let the existing shape's own click/dblclick handle it
      const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
      const id = `note_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`;
      onMutate((s) => ({
        ...s,
        annotations: [...s.annotations, { id, layerId: s.layers.find((l) => !l.locked)?.id || s.layers[0]?.id, x, y, text: '' }],
      }));
      setDraftText('');
      setEditingAnnotationId(id);
      return;
    }

    if (mode !== 'draw') {
      if (clickedEmptyCanvas) {
        onSelectElement?.(null);
        onSelectAnnotation?.(null);
      }
      return;
    }

    const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
    setDrawingPoints([x, y]);
  }

  function handleStageMouseMove() {
    if (mode !== 'draw' || !drawingPoints) return;
    const { x, y } = stagePointToScene(internalStageRef.current.getPointerPosition());
    setDrawingPoints((prev) => [...prev, x, y]);
  }

  function handleStageMouseUp() {
    if (mode !== 'draw' || !drawingPoints) return;
    if (drawingPoints.length >= 4) {
      onMutate((s) => ({
        ...s,
        strokes: [...s.strokes, {
          id: `stroke_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`,
          layerId: s.layers[0]?.id,
          points: drawingPoints,
          color: strokeColor,
          strokeWidth: 2,
        }],
      }));
    }
    setDrawingPoints(null);
  }

  const grid = showGrid ? gridLinePositions(width * 3, height * 3, scene.scalePxPerUnit, scene.gridSpacing) : { vertical: [], horizontal: [] };
  const visibleLayerIds = new Set(scene.layers.filter((l) => l.visible).map((l) => l.id));
  const editingAnnotation = editingAnnotationId ? scene.annotations.find((a) => a.id === editingAnnotationId) : null;

  return (
    <div
      className="relative shrink-0 border border-slate-200 rounded-lg overflow-hidden bg-white"
      style={{ width, height, cursor: mode === 'note' ? 'copy' : mode === 'draw' ? 'crosshair' : 'default' }}
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
        onWheel={handleWheel}
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
          {scene.strokes.filter((s) => visibleLayerIds.has(s.layerId)).map((s) => (
            <Line key={s.id} points={s.points} stroke={s.color} strokeWidth={s.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} />
          ))}
          {drawingPoints && <Line points={drawingPoints} stroke={strokeColor} strokeWidth={2} lineCap="round" lineJoin="round" tension={0.4} />}

          {scene.elements.filter((el) => visibleLayerIds.has(el.layerId)).map((el) => (
            <ElementShape
              key={el.id}
              element={el}
              icon={iconRegistry?.[el.iconId]}
              isSelected={el.id === selectedElementId}
              onSelect={() => { onSelectElement?.(el.id); onSelectAnnotation?.(null); }}
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
              onSelect={() => { onSelectAnnotation?.(a.id); onSelectElement?.(null); }}
              onEdit={() => startEditingAnnotation(a)}
              onDragEnd={(id, pos) => onAdjust((s) => ({
                ...s,
                annotations: s.annotations.map((an) => (an.id === id ? { ...an, ...pos } : an)),
              }))}
            />
          ))}

          <Transformer
            ref={trRef}
            rotateEnabled
            onTransformEnd={() => {
              const node = selectedElementId ? shapeRefs.current[selectedElementId] : null;
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
          className="absolute rounded border-2 border-indigo-500 bg-yellow-50 text-amber-900 text-xs p-1.5 resize-none outline-none"
          style={{
            left: editingAnnotation.x * zoom + stagePos.x,
            top: editingAnnotation.y * zoom + stagePos.y,
            width: NOTE_WIDTH * zoom,
            height: NOTE_HEIGHT * zoom,
          }}
        />
      )}
    </div>
  );
}
