import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Chart, registerables } from "chart.js";
import "chartjs-adapter-date-fns";

Chart.register(...registerables);

// ▼▼▼ วาง URL ของ WEB APP ที่คุณคัดลอกมา ▼▼▼
const GAS_API_URL =
  "https://script.google.com/macros/s/AKfycbyekoFa8n_O51O_2p1kG3i0e_ZMq8P9uVy7Cxk-fVSUfe3szG5KDMw52XtQAgEpUCET1g/exec";

// Helper (จาก detail.html)
function inferUnitFromKey(keyName) {
  if (!keyName) return "";
  const k = String(keyName).toLowerCase();
  if (k.includes("℃") || k.includes("温度") || k.includes("temp")) return "°C";
  if (
    k.includes("%") ||
    k.includes("開度") ||
    k.includes("valve") ||
    k.includes("o2")
  )
    return "%";
  if (k.includes("ppm")) return "ppm";
  return "";
}

function Detail() {
  const [searchParams] = useSearchParams();
  const model = searchParams.get("model");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  // State สำหรับ Slider
  const [sliderStep, setSliderStep] = useState(24); // 0-23 (ชม.), 24-30 (วัน) | เริ่มที่ 1 วัน (step 24)
  const [rangeHours, setRangeHours] = useState(24);
  const [rangeText, setRangeText] = useState("1 日");

  // อัปเดต state เมื่อ slider เปลี่ยน
  const handleSliderChange = (e) => {
    const step = parseInt(e.target.value, 10);
    setSliderStep(step);

    let hours;
    let displayText;
    if (step <= 23) {
      hours = step + 1;
      displayText = `${hours} 時間`;
    } else {
      const days = step - 23;
      hours = days * 24;
      displayText = `${days} 日`;
    }
    setRangeHours(hours);
    setRangeText(displayText);
  };

  // ตรรกะการวาดกราฟ
  useEffect(() => {
    if (!model || !canvasRef.current) return;

    const renderDetailChart = async (model, hours) => {
      setIsLoading(true);
      setError(null);
      const ctx = canvasRef.current.getContext("2d");

      try {
        const response = await axios.get(GAS_API_URL, {
          params: {
            endpoint: "history",
            model: model,
            range_hours: hours,
          },
        });
        const historyData = response.data;

        // (ตรรกะการสร้าง Dataset เหมือนใน detail.html)
        let colorIndex = 0;
        const axisUnit = { y_temp: "", y_valve: "" };
        const colorPalette = [
          "#ef4444",
          "#3b82f6",
          "#f97316",
          "#8b5cf6",
          "#10b981",
          "#06b6d4",
          "#d946ef",
        ];

        const datasets = Object.entries(historyData || {})
          .map(([sensorName, records]) => {
            if (!records || records.length === 0) return null;
            records.sort((a, b) => new Date(a.time) - new Date(b.time)); // เรียงข้อมูล
            const fieldName = records[0].field || "";
            const isTemperature = fieldName.includes("温度");
            const yAxisID = isTemperature ? "y_temp" : "y_valve";
            const unit = inferUnitFromKey(fieldName);
            if (!axisUnit[yAxisID] && unit) axisUnit[yAxisID] = unit;
            const data = records.map((r) => ({ x: r.time, y: r.value }));
            const color = colorPalette[colorIndex % colorPalette.length];
            colorIndex++;
            return {
              label: sensorName,
              data,
              borderColor: color,
              backgroundColor: color + "33",
              yAxisID,
              tension: 0.2,
              borderWidth: 2,
              pointRadius: 0,
              pointHitRadius: 10,
              _unit: unit,
              spanGaps: false,
            };
          })
          .filter(Boolean);

        if (!axisUnit.y_temp) axisUnit.y_temp = "°C";
        if (!axisUnit.y_valve) axisUnit.y_valve = "%";

        if (chartRef.current) {
          chartRef.current.destroy();
        }

        const timeUnit = hours > 48 ? "day" : "hour";
        const displayFormats =
          hours > 48 ? { day: "MM/dd" } : { hour: "HH:mm" };
        const now = new Date();
        const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

        chartRef.current = new Chart(ctx, {
          type: "line",
          data: { datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              x: {
                type: "time",
                time: { unit: timeUnit, displayFormats: displayFormats },
                title: { display: true, text: "時刻" },
                min: startTime,
                max: now,
              },
              y_temp: {
                type: "linear",
                position: "left",
                title: {
                  display: true,
                  text: `温度 (${axisUnit.y_temp})`,
                  font: { size: 14 },
                },
                ticks: { color: "#c026d3" },
              },
              y_valve: {
                type: "linear",
                position: "right",
                title: {
                  display: true,
                  text: `開度 (${axisUnit.y_valve})`,
                  font: { size: 14 },
                },
                grid: { drawOnChartArea: false },
                ticks: { color: "#1d4ed8" },
              },
            },
            plugins: {
              legend: {
                position: "bottom",
                labels: { boxWidth: 15, font: { size: 12 } },
              },
              tooltip: {
                /* (Tooltip callbacks) */
              },
            },
          },
        });
      } catch (error) {
        console.error(`Error rendering chart for ${model}:`, error);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    // (Debounce logic ถูกตัดออกไปก่อนเพื่อง่ายต่อการพอร์ต)
    renderDetailChart(model, rangeHours);

    // Cleanup
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [model, rangeHours]); // ดึงใหม่ถ้า model หรือ rangeHours เปลี่ยน

  if (!model) {
    return <div>エラー: 機種が指定されていません</div>;
  }

  return (
    <div className="bg-gray-100 text-gray-800 min-h-screen flex flex-col">
      <header className="border-b bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div>
            <h1
              id="plant-title"
              className="text-2xl font-bold tracking-tight text-gray-900"
            >
              {model}
            </h1>
            <p className="text-sm text-gray-600">プラント稼働状況詳細</p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            ダッシュボードに戻る
          </Link>
        </div>
      </header>

      <main className="flex-grow w-full max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="bg-white rounded-xl shadow-lg p-4 h-full flex flex-col">
          {/* Slider (จาก detail.html) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold">稼働履歴グラフ</h2>
            <div className="flex items-center gap-3 w-full sm:w-80">
              <input
                type="range"
                id="range-slider"
                min="0"
                max="30"
                value={sliderStep}
                onChange={handleSliderChange}
                className="w-full"
                style={{
                  accentColor: "#4f46e5", // สำหรับ Chrome/Edge
                }}
              />
              <span
                id="range-value-display"
                className="font-semibold text-indigo-600 text-center w-24 bg-indigo-50 p-2 rounded-lg text-sm"
              >
                {rangeText}
              </span>
            </div>
          </div>

          <div
            id="chart-container"
            className="relative flex-grow w-full min-h-[65vh]"
          >
            {isLoading && (
              <div
                id="loading-chart"
                className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 backdrop-blur-sm"
              >
                <div className="text-center">
                  <svg
                    className="animate-spin h-8 w-8 text-indigo-600 mx-auto"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <p className="mt-2 font-medium text-gray-600">
                    グラフを読み込み中...
                  </p>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-red-600">エラー: {error}</p>
              </div>
            )}
            <canvas id="detail-chart" ref={canvasRef}></canvas>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Detail;
