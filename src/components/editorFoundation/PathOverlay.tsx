import { mapPoint, pathSource, type PathGeometry } from '../../blocks/pathGeometry';
export default function PathOverlay({ geometry, matrix, scale }: { geometry: PathGeometry; matrix: readonly number[]; scale: number }) {
  return <g>
    <path d={pathSource(geometry, true)} transform={'matrix(' + matrix.join(' ') + ')'} fill="none" stroke="var(--accent)" strokeWidth={1.5 / scale} vectorEffect="non-scaling-stroke" />
    {geometry.points.map((point, i) => {
      const at = mapPoint(matrix, point);
      return <g key={i}>
        {(['in', 'out'] as const).map(side => {
          if (!point[side]) return null;
          const handle = mapPoint(matrix, point[side]);
          return <g key={side}><line x1={at.x} y1={at.y} x2={handle.x} y2={handle.y} stroke="var(--accent)" strokeWidth={1 / scale} />
            <circle data-pen-handle={i + '-' + side} cx={handle.x} cy={handle.y} r={4 / scale} fill="var(--bg)" stroke="var(--accent)" strokeWidth={1.5 / scale} /></g>;
        })}
        <rect data-pen-point={i} x={at.x - 4 / scale} y={at.y - 4 / scale} width={8 / scale} height={8 / scale} fill={i === 0 ? 'var(--bg)' : 'var(--accent)'} stroke="var(--accent)" strokeWidth={1.5 / scale} />
      </g>;
    })}
  </g>;
}
