import { useState } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { TrendingUp, RefreshCw, AlertCircle, BarChart2 } from 'lucide-react'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('formula') // 'formula' or 'tpo'
  
  // Formula State
  const [formula, setFormula] = useState('^NSEI * (CL=F / GC=F)')
  const [range, setRange] = useState('5y')
  const [data, setData] = useState(null)
  
  // TPO State
  const [tpoSymbol, setTpoSymbol] = useState('AAPL')
  const [tpoInterval, setTpoInterval] = useState('30m')
  const [tpoData, setTpoData] = useState(null)
  const [timeIndex, setTimeIndex] = useState(-1)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchFormulaData = async () => {
    if (!formula.trim()) {
      setError('Please enter a formula')
      return
    }
    setLoading(true)
    setError('')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await axios.get(`${apiUrl}/api/ratio`, {
        params: { formula, range }
      })
      setData(res.data)
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.error || 'Failed to fetch formula data')
    } finally {
      setLoading(false)
    }
  }

  const fetchTpoData = async () => {
    if (!tpoSymbol.trim()) {
      setError('Please enter a symbol')
      return
    }
    setLoading(true)
    setError('')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await axios.get(`${apiUrl}/api/tpo`, {
        params: { symbol: tpoSymbol, interval: tpoInterval }
      })
      setTpoData(res.data)
      if (res.data && res.data.ratioHistory) {
        setTimeIndex(res.data.ratioHistory.length - 1)
      }
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.error || 'Failed to fetch TPO data')
    } finally {
      setLoading(false)
    }
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <p className="label">{`Date: ${label}`}</p>
          <p className="intro">{`Value: ${dataPoint.value.toFixed(4)}`}</p>
          {data?.symbols?.map(sym => (
            <p key={sym} className="desc">{`${sym}: ${dataPoint[sym] != null ? dataPoint[sym].toFixed(2) : 'N/A'}`}</p>
          ))}
        </div>
      );
    }
    return null;
  };

  let lineColor = "#8884d8";
  if (data && data.data && data.data.length > 0) {
      const first = data.data[0].value;
      const last = data.data[data.data.length - 1].value;
      lineColor = last >= first ? "#10b981" : "#ef4444";
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <TrendingUp size={28} />
          <h1>Relative Value Charts</h1>
        </div>
        <p className="subtitle">Visualize complex relationships and market profiles</p>
        
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'formula' ? 'active' : ''}`}
            onClick={() => { setActiveTab('formula'); setError(''); }}
          >
            Formula Builder
          </button>
          <button 
            className={`tab ${activeTab === 'tpo' ? 'active' : ''}`}
            onClick={() => { setActiveTab('tpo'); setError(''); }}
          >
            <BarChart2 size={16} /> Market Profile (TPO)
          </button>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'formula' && (
          <>
            <div className="controls-panel">
              <div className="input-group" style={{ flex: 2 }}>
                <label>Formula</label>
                <input 
                  type="text" 
                  value={formula} 
                  onChange={e => setFormula(e.target.value)} 
                  placeholder="e.g. ^NSEI * (CL=F / GC=F) + ^NSEBANK"
                />
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label>Time Range</label>
                <select value={range} onChange={e => setRange(e.target.value)}>
                  <option value="1mo">1 Month</option>
                  <option value="3mo">3 Months</option>
                  <option value="6mo">6 Months</option>
                  <option value="1y">1 Year</option>
                  <option value="2y">2 Years</option>
                  <option value="5y">5 Years</option>
                  <option value="10y">10 Years</option>
                  <option value="max">Max</option>
                </select>
              </div>
              
              <button 
                className="btn-generate" 
                onClick={fetchFormulaData}
                disabled={loading}
              >
                {loading ? <RefreshCw className="spin" size={20} /> : 'Generate Chart'}
              </button>
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <div className="chart-container">
              {!data && !loading && !error && (
                <div className="empty-state">
                  <p>Enter a formula and click "Generate Chart" to begin</p>
                </div>
              )}
              
              {loading && (
                 <div className="loading-state">
                   <RefreshCw className="spin" size={32} />
                   <p>Fetching and computing data...</p>
                 </div>
              )}

              {data && !loading && data.data && data.data.length > 0 && (
                <>
                  <div className="chart-header">
                    <h2>{data.formula}</h2>
                    <span className="current-value">
                      Current: {data.data[data.data.length - 1].value.toFixed(4)}
                    </span>
                  </div>
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height={500}>
                      <LineChart data={data.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#888" 
                          tick={{fill: '#888'}}
                          tickMargin={10}
                          minTickGap={30}
                        />
                        <YAxis 
                          domain={['auto', 'auto']} 
                          stroke="#888" 
                          tick={{fill: '#888'}}
                          tickFormatter={(value) => value.toFixed(2)}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke={lineColor} 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 6, fill: lineColor, stroke: '#1a1a1a', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {activeTab === 'tpo' && (
          <>
            <div className="controls-panel">
              <div className="input-group" style={{ flex: 2 }}>
                <label>Symbol</label>
                <input 
                  type="text" 
                  value={tpoSymbol} 
                  onChange={e => setTpoSymbol(e.target.value)} 
                  placeholder="e.g. AAPL"
                />
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label>Time per TPO</label>
                <select value={tpoInterval} onChange={e => setTpoInterval(e.target.value)}>
                  <option value="5m">5 Minutes</option>
                  <option value="15m">15 Minutes</option>
                  <option value="30m">30 Minutes</option>
                  <option value="60m">1 Hour</option>
                  <option value="90m">1.5 Hours</option>
                </select>
              </div>
              
              <button 
                className="btn-generate" 
                onClick={fetchTpoData}
                disabled={loading}
              >
                {loading ? <RefreshCw className="spin" size={20} /> : 'Generate TPO'}
              </button>
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            <div className="chart-container">
              {!tpoData && !loading && !error && (
                <div className="empty-state">
                  <p>Enter a symbol to view its Market Profile (TPO) for the latest trading day.</p>
                </div>
              )}
              
              {loading && (
                 <div className="loading-state">
                   <RefreshCw className="spin" size={32} />
                   <p>Fetching intraday data and mapping profile...</p>
                 </div>
              )}

              {tpoData && !loading && (
                <>
                  <div className="chart-header">
                    <div>
                      <h2>{tpoData.symbol} Market Profile (TPO)</h2>
                      <span style={{color: '#94a3b8', fontSize: '0.9rem'}}>{tpoData.date}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="current-value" style={{ fontSize: '1.2rem', color: '#f59e0b' }}>
                        POC: {timeIndex >= 0 && tpoData.ratioHistory[timeIndex] ? tpoData.ratioHistory[timeIndex].poc.toFixed(2) : tpoData.pocPrice?.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '4px' }}>
                        Ratio (Above/Below POC): <span style={{color: '#f8fafc', fontWeight: 600}}>
                          {timeIndex >= 0 && tpoData.ratioHistory[timeIndex] ? tpoData.ratioHistory[timeIndex].ratio.toFixed(2) : tpoData.ratioAboveVsBelow.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="tpo-dashboard">
                    <div className="tpo-wrapper">
                      {tpoData.bins.map((bin, i) => {
                        const currentPoc = timeIndex >= 0 && tpoData.ratioHistory[timeIndex] ? tpoData.ratioHistory[timeIndex].poc : tpoData.pocPrice;
                        const isPocRow = bin.displayPrice === currentPoc;
                        
                        // Filter letters based on timeIndex
                        const visibleLetters = bin.letters.filter(l => {
                          const lIdx = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.indexOf(l);
                          return lIdx <= timeIndex;
                        });

                        return (
                          <div key={i} className={`tpo-row ${isPocRow ? 'poc-row' : ''}`}>
                            <div className="tpo-price">{bin.displayPrice.toFixed(2)}</div>
                            <div className="tpo-letters">
                              {visibleLetters.map((l, j) => {
                                const index = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.indexOf(l);
                                const hue = index !== -1 ? (index / 51) * 300 : 210;
                                const bgColor = isPocRow ? '#0f172a' : `hsl(${hue}, 70%, 55%)`;
                                const textColor = isPocRow ? '#f8fafc' : '#ffffff';
                                const border = isPocRow ? '1px solid #334155' : 'none';

                                return (
                                  <div 
                                    key={j} 
                                    className="tpo-block" 
                                    style={{ backgroundColor: bgColor, color: textColor, border: border }}
                                    title={`Period: ${l}`}
                                  >
                                    {l}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="ratio-chart-wrapper">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={tpoData.ratioHistory} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                          <XAxis 
                            dataKey="time" 
                            stroke="#888" 
                            tick={{fill: '#888', fontSize: 12}}
                            angle={-45}
                            textAnchor="end"
                          />
                          <YAxis 
                            stroke="#888" 
                            tick={{fill: '#888', fontSize: 12}}
                            domain={[0, 'auto']}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                            itemStyle={{ color: '#3b82f6' }}
                          />
                          <Line 
                            type="stepAfter" 
                            dataKey="ratio" 
                            name="Ratio (Above/Below)"
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {timeIndex >= 0 && tpoData.ratioHistory.length > 0 && (
                    <div className="timeline-slider-container">
                      <div className="slider-header">
                        <span>Playback Timeline</span>
                        <span className="slider-time">{tpoData.ratioHistory[timeIndex]?.time}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max={tpoData.ratioHistory.length - 1} 
                        value={timeIndex} 
                        onChange={e => setTimeIndex(parseInt(e.target.value))}
                        className="timeline-slider"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

      </main>
    </div>
  )
}

export default App
