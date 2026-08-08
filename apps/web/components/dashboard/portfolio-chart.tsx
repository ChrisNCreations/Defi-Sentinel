'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts'
import type { PieSectorShapeProps } from 'recharts'

interface AllocationItem {
  token: string
  percentage: number
  usdValue: number
  color: string
}

interface Props {
  allocation: AllocationItem[]
  totalValue: number
}

function SectorShape(props: PieSectorShapeProps) {
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    isActive,
  } = props

  const activeOuter = isActive ? outerRadius + 8 : outerRadius

  if (!isActive) {
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={2}
      />
    )
  }

  const RADIAN = Math.PI / 180
  const sin = Math.sin(-(midAngle ?? 0) * RADIAN)
  const cos = Math.cos(-(midAngle ?? 0) * RADIAN)
  const sx = cx + (activeOuter + 10) * cos
  const sy = cy + (activeOuter + 10) * sin
  const mx = cx + (activeOuter + 30) * cos
  const my = cy + (activeOuter + 30) * sin
  const ex = mx + (cos >= 0 ? 1 : -1) * 22
  const ey = my
  const textAnchor = cos >= 0 ? 'start' : 'end'
  const token = (payload as AllocationItem | undefined)?.token ?? ''
  const usdValue = (payload as AllocationItem | undefined)?.usdValue ?? 0

  return (
    <g>
      <text
        x={cx}
        y={cy}
        dy={-4}
        textAnchor="middle"
        fill="#121722"
        className="text-sm font-semibold"
      >
        {token}
      </text>
      <text x={cx} y={cy} dy={16} textAnchor="middle" fill="#777c86" className="text-xs">
        {((percent ?? 0) * 100).toFixed(0)}%
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={activeOuter}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={activeOuter + 12}
        outerRadius={activeOuter + 16}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={3} fill={fill} stroke="none" />
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 8}
        y={ey}
        textAnchor={textAnchor}
        fill="#121722"
        className="text-xs"
      >
        ${usdValue.toLocaleString()}
      </text>
    </g>
  )
}

export function PortfolioChart({ allocation, totalValue }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className="flex flex-col items-center">
      <div className="h-64 w-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={allocation}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="usdValue"
              nameKey="token"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              shape={(props: PieSectorShapeProps) => (
                <SectorShape {...props} isActive={props.index === activeIndex || props.isActive} />
              )}
            >
              {allocation.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 w-full space-y-2">
        {allocation.map((item, index) => (
          <div
            key={item.token}
            className="flex cursor-default items-center justify-between text-sm"
            onMouseEnter={() => setActiveIndex(index)}
          >
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-medium text-ink">{item.token}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-slate">{item.percentage}%</span>
              <span className="font-medium text-ink">${item.usdValue.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex w-full items-center justify-between border-t border-hairline pt-4">
        <span className="text-sm text-slate">Total Value</span>
        <span className="text-lg font-semibold text-ink">${totalValue.toLocaleString()}</span>
      </div>
    </div>
  )
}
