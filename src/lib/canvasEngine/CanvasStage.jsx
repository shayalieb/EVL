import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Transformer } from 'react-konva';
import { gridLinePositions, snapPointToGrid } from './measurement';

// Placeholder rendering for an element until real icon assets are sourced
// (see canvas engine planning notes — a real content-creation task, not
// code). Renders a labeled shape so the engine's mechanics (drag, select,
// transform, export) can be fully proven without them.
function ElementShape({ element, isSelected, onSelect, onDragEnd, shapeRef }) {
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
  return (
    <>
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
      <Text
        x={element.x}
        y={element.y}
        text={element.label || element.iconId || ''}
        fontSize={11}
        fill="#334155"
        offsetX={20}
        offsetY={-24}
        width={40}
        align="center"
        listening={false}
      />
    </>
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
  mode = 'select', // 'select' | 'draw'
  strokeColor = '#1e293b',
  selectedElementId,
  onSelectElement,
  stageRef,
}) {
  const internalStageRef = useRef(null);
  const trRef = useRef(null);
  const shapeRefs = useRef({});
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [drawingPoints, setDrawingPoints] = useState(null);

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

  // Coordinates relative to the un-zoomed/un-panned scene, from a raw
  // pointer/drop position on the container element — every placement path
  // (native HTML5 drop, freehand draw) goes through this so pan/zoom never
  // desyncs the visual position from the stored scene position.
  function toSceneCoords(clientX, clientY) {
    const rect = internalStageRef.current.container().getBoundingClientRect();
    const x = (clientX - rect.left - stagePos.x) / zoom;
    const y = (clientY - rect.top - stagePos.y) / zoom;
    return snapEnabled ? snapPointToGrid({ x, y }, scene.scalePxPerUnit, scene.gridSpacing) : { x, y };
  }

  function handleDrop(e) {
    e.preventDefault();
    const iconId = e.dataTransfer.getData('application/x-canvas-icon');
    if (!iconId) return;
    const { x, y } = toSceneCoords(e.clientX, e.clientY);
    onMutate((s) => ({
      ...s,
      elements: [...s.elements, {
        id: `el_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`,
        layerId: s.layers.find((l) => !l.locked)?.id || s.layers[0]?.id,
        iconId, x, y, rotation: 0, scaleX: 1, scaleY: 1, label: iconId,
      }],
    }));
  }

  function handleStageMouseDown(e) {
    if (mode !== 'draw') {
      // Clicked empty canvas — deselect.
      if (e.target === e.target.getStage()) onSelectElement?.(null);
      return;
    }
    const pos = internalStageRef.current.getPointerPosition();
    const { x, y } = toSceneCoords(pos.x + internalStageRef.current.container().getBoundingClientRect().left, pos.y + internalStageRef.current.container().getBoundingClientRect().top);
    setDrawingPoints([x, y]);
  }

  function handleStageMouseMove() {
    if (mode !== 'draw' || !drawingPoints) return;
    const stage = internalStageRef.current;
    const pos = stage.getPointerPosition();
    const rect = stage.container().getBoundingClientRect();
    const { x, y } = toSceneCoords(pos.x + rect.left, pos.y + rect.top);
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

  return (
    <div
      className="border border-slate-200 rounded-lg overflow-hidden bg-white"
      style={{ width, height }}
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
              isSelected={el.id === selectedElementId}
              onSelect={() => onSelectElement?.(el.id)}
              onDragEnd={(id, pos) => onMutate((s) => ({
                ...s,
                elements: s.elements.map((e) => (e.id === id ? { ...e, ...(snapEnabled ? snapPointToGrid(pos, s.scalePxPerUnit, s.gridSpacing) : pos) } : e)),
              }))}
              shapeRef={(node) => { if (node) shapeRefs.current[el.id] = node; else delete shapeRefs.current[el.id]; }}
            />
          ))}

          {scene.annotations.filter((a) => visibleLayerIds.has(a.layerId)).map((a) => (
            <Text
              key={a.id}
              x={a.x}
              y={a.y}
              text={a.text}
              fontSize={13}
              fill="#0f172a"
              draggable
              onDragEnd={(e) => onAdjust((s) => ({
                ...s,
                annotations: s.annotations.map((an) => (an.id === a.id ? { ...an, x: e.target.x(), y: e.target.y() } : an)),
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
    </div>
  );
}
