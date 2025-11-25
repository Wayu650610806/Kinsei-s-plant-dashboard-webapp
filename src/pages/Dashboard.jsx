import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Chart, registerables } from "chart.js";
import "chartjs-adapter-date-fns";

// (โค้ดส่วนนี้เหมือนเดิม)
Chart.register(...registerables);
const GAS_API_URL =
  "https://script.google.com/macros/s/AKfycbyekoFa8n_O51O_2p1kG3i0e_ZMq8P9uVy7Cxk-fVSUfe3szG5KDMw52XtQAgEpUCET1g/exec"; // <-- ใส่ URL ของคุณ
const REFRESH_INTERVAL = 60 * 1000;
function toSafeId(plant) {
  const uniqueString = `${plant.model || ""}-${plant.customer || ""}-${
    plant.province || ""
  }`;
  return String(uniqueString)
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function formatDateTime(isoString) {
  if (!isoString) return "N/A";
  try {
    const date = new Date(isoString);
    return `${date.getFullYear()}年${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}月${date.getDate().toString().padStart(2, "0")}日 ${date
      .getHours()
      .toString()
      .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  } catch (e) {
    return "Invalid Date";
  }
}
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
function getStatusIndicator(status) {
  if (!status) return <span className="text-gray-500">-</span>;
  const colorMap = {
    AUTO: "bg-green-500",
    "投入・灰出": "bg-yellow-500",
    冷却: "bg-blue-500",
  };
  const colorClass = colorMap[status] || "bg-gray-400";
  return (
    <div className="flex items-center text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${colorClass} mr-2`}></span>
      <span>{status}</span>
    </div>
  );
}

//================================================
// React Components
//================================================

/**
 * Component: กราฟย่อย (Mini Chart)
 * ▼▼▼ อัปเกรดแล้ว: รับ historyData จาก props และหยุดยิง API ▼▼▼
 */
const MiniChart = React.memo(({ historyData, modelName }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const renderChart = () => {
      if (!canvasRef.current || !historyData) return;
      const ctx = canvasRef.current.getContext("2d");

      try {
        // (ไม่ต้องยิง axios.get แล้ว!)

        let colorIndex = 0;
        const axisUnit = { y_temp: "", y_valve: "" };
        const datasets = Object.entries(historyData || {})
          .map(([sensorName, records]) => {
            if (!records || records.length === 0) return null;
            const fieldName = records[0].field || "";
            const isTemp = fieldName.includes("温度");
            const yAxisID = isTemp ? "y_temp" : "y_valve";
            const unit = inferUnitFromKey(fieldName);
            if (!axisUnit[yAxisID] && unit) axisUnit[yAxisID] = unit;

            // ข้อมูลถูกส่งมาแล้ว (อาจจะยังไม่เรียง) ต้องเรียงก่อน
            const sortedRecords = records.sort(
              (a, b) => new Date(a.time) - new Date(b.time)
            );
            const data = sortedRecords.map((r) => ({ x: r.time, y: r.value }));

            const color = ["#ef4444", "#3b82f6", "#f97316", "#8b5cf6"][
              colorIndex % 4
            ];
            colorIndex++;
            return {
              label: sensorName,
              data,
              borderColor: color,
              backgroundColor: color + "33",
              yAxisID,
              tension: 0.1,
              borderWidth: 2,
              pointRadius: 0,
              _unit: unit,
            };
          })
          .filter(Boolean);

        if (!axisUnit.y_temp) axisUnit.y_temp = "°C";
        if (!axisUnit.y_valve) axisUnit.y_valve = "%";

        if (chartRef.current) {
          chartRef.current.destroy();
        }

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
                time: { unit: "hour", displayFormats: { hour: "HH:mm" } },
                ticks: { font: { size: 9 } },
              },
              y_temp: {
                type: "linear",
                position: "left",
                ticks: { font: { size: 9 }, color: "#c026d3" },
              },
              y_valve: {
                type: "linear",
                position: "right",
                grid: { drawOnChartArea: false },
                ticks: { font: { size: 9 }, color: "#1d4ed8" },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: { bodySpacing: 4, titleFont: { size: 14 } },
            },
          },
        });
      } catch (error) {
        console.error(`Error rendering chart for ${modelName}:`, error);
        if (ctx && canvasRef.current) {
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
          ctx.font = "14px sans-serif";
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "center";
          ctx.fillText(
            "グラフ読込失敗",
            canvasRef.current.width / 2,
            canvasRef.current.height / 2
          );
        }
      }
    };

    renderChart();

    // Cleanup
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [historyData, modelName]); // Re-render if data changes

  return (
    <div className="relative w-full flex-grow" style={{ height: "260px" }}>
      <canvas ref={canvasRef} className="w-full h-full"></canvas>
    </div>
  );
});
/* ▲▲▲ สิ้นสุดการอัปเกรด MiniChart ▲▲▲ */

/**
 * Component: การ์ดเซ็นเซอร์ (Sensor Card)
 * (โค้ดส่วนนี้เหมือนเดิม)
 */
const SensorCard = ({ name, data }) => {
  if (!data)
    return (
      <div className="border border-transparent rounded-lg p-2 invisible h-[100px]"></div>
    );
  let tempVal, kadoVal, statusVal;
  for (const [k, v] of Object.entries(data)) {
    const val = v;
    if (k.includes("温度") || k.toLowerCase().includes("temp"))
      tempVal = { value: Number(val), unit: inferUnitFromKey(k) };
    if (
      k.includes("開度") ||
      k.includes("%") ||
      k.toLowerCase().includes("valve")
    )
      kadoVal = { value: val, unit: inferUnitFromKey(k) };
    if (k.includes("運転状況") || k.includes("status")) statusVal = val;
  }
  let effectClass = "",
    bgClass = "bg-gray-50";
  const normalizedName = name || "";
  if (normalizedName.includes("乾溜ガス化炉")) {
    if (statusVal === "AUTO") {
      effectClass = "fire-effect";
      bgClass = "bg-red-50";
    } else if (statusVal === "冷却") {
      effectClass = "ice-effect";
      bgClass = "bg-blue-50";
    }
  } else if (normalizedName.includes("乾溜空気弁")) {
    if (kadoVal && Number(kadoVal.value) > 0) {
      effectClass = "green-effect";
      bgClass = "bg-green-50";
    }
  } else {
    if (tempVal && tempVal.value !== undefined && Number(tempVal.value) > 50) {
      effectClass = "fire-effect";
      bgClass = "bg-red-50";
    }
  }
  let dataRows = [];
  if (statusVal !== undefined)
    dataRows.push(
      <div key="status" className="flex justify-between items-center">
        <dt className="text-gray-500">状況</dt>
        <dd className="font-medium">{getStatusIndicator(statusVal)}</dd>
      </div>
    );
  if (tempVal && tempVal.value !== undefined && !isNaN(tempVal.value))
    dataRows.push(
      <div key="temp" className="flex justify-between items-center">
        <dt className="text-gray-500">温度</dt>
        <dd className="font-semibold text-red-600">
          {Number(tempVal.value).toFixed(1)}
          <span className="text-xs text-gray-500 ml-1">
            {tempVal.unit || "°C"}
          </span>
        </dd>
      </div>
    );
  if (kadoVal && kadoVal.value !== undefined)
    dataRows.push(
      <div key="kado" className="flex justify-between items-center">
        <dt className="text-gray-500">開度</dt>
        <dd className="font-semibold text-blue-600">
          {kadoVal.value}
          <span className="text-xs text-gray-500 ml-1">
            {kadoVal.unit || "%"}
          </span>
        </dd>
        </div>
    );
  return (
    <div
      className={`${bgClass} border border-gray-200 rounded-lg p-2 ${effectClass} transition-all duration-300 h-[100px]`}
    >
      <h3 className="font-bold text-base text-gray-800">{name}</h3>
      <dl className="mt-1.5 space-y-1 text-sm">{dataRows}</dl>
    </div>
  );
};

/**
 * Component: การ์ดแสดงผล Plant (Plant Card)
 * ▼▼▼ อัปเกรดแล้ว: ส่ง plant.history ให้ MiniChart ▼▼▼
 */
const PlantCard = React.memo(({ plant }) => {
  const sensors = plant.sensors || {};
  const gasificationFurnaces = Object.fromEntries(
    Object.entries(sensors).filter(([name]) => name.includes("乾溜ガス化炉"))
  );
  const airValves = Object.fromEntries(
    Object.entries(sensors).filter(([name]) => name.includes("乾溜空気弁"))
  );
  const combustionFurnace = Object.entries(sensors).find(
    ([name]) => name === "燃焼炉"
  );
  const exhaustGasData = sensors["排ガス濃度"] || {};
  const coKey = Object.keys(exhaustGasData).find((k) => k.includes("CO"));
  const o2Key = Object.keys(exhaustGasData).find((k) => k.includes("O2"));
  const coValue = coKey ? exhaustGasData[coKey] : undefined;
  const o2Value = o2Key ? exhaustGasData[o2Key] : undefined;
  const suffixes = new Set();
  [...Object.keys(gasificationFurnaces), ...Object.keys(airValves)].forEach(
    (name) => {
      const suffix = name.slice(-1);
      if (suffix >= "A" && suffix <= "Z") suffixes.add(suffix);
    }
  );
  const sortedSuffixes = Array.from(suffixes).sort();
  const displayLastUpdatedISO = plant.last_updated || new Date().toISOString();
  const imageUrlPng = `${plant.image_url}.png`;
  const imageUrlJpg = `${plant.image_url}.jpg`;

  return (
    <div className="bg-white rounded-xl shadow-md p-3 mb-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Column 1: Info & Image (เหมือนเดิม) */}
        <div className="lg:col-span-1">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left w-full">
            <img
              src={imageUrlPng}
              alt={plant.customer}
              className="w-full max-w-xs lg:max-w-full h-auto object-cover rounded-lg shadow-md mb-3"
              onError={(e) => {
                if (!e.target.src.endsWith(".jpg")) {
                  e.target.src = imageUrlJpg;
                } else {
                  e.target.src =
                    "https://placehold.co/300x225/e2e8f0/64748b?text=No+Image";
                }
              }}
            />
            <h2 className="text-xl font-bold text-gray-900">
              {plant.customer || ""}
            </h2>
            <p className="text-base text-gray-600">{plant.model}</p>
            <p className="text-sm text-gray-500">{plant.province || ""}</p>
            <p className="text-xs text-gray-500 mt-2">
              <strong>最終更新:</strong> {formatDateTime(displayLastUpdatedISO)}
            </p>
          </div>
          </div>

        {/* Column 2-5: Sensors & Chart (เหมือนเดิม) */}
        <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full">
          {/* Col 1: 乾溜ガス化炉 */}
          <div className="space-y-3">
            {sortedSuffixes.map((suffix) => {
              const gasFurnaceData =
                gasificationFurnaces[`乾溜ガス化炉${suffix}`];
              if (!gasFurnaceData) return null;
              let currentStatus = gasFurnaceData["運転状況"];
              if (currentStatus === "None") {
                const airValveData = airValves[`乾溜空気弁${suffix}`];
                const tempKey = Object.keys(gasFurnaceData).find((k) =>
                  k.includes("温度")
                );
                const temp = tempKey ? Number(gasFurnaceData[tempKey]) : 0;
                const fanKey = airValveData
                  ? Object.keys(airValveData).find((k) => k.includes("開度"))
                  : null;
                const fan = fanKey ? Number(airValveData[fanKey]) : 0;
                if (temp < 40 && fan === 0) {
                  currentStatus = "投入・灰出";
                } else {
                  currentStatus = "冷却";
                }
              } else if (currentStatus === "Cooling") {
                currentStatus = "冷却";
              } else if (currentStatus === "Auto") {
                currentStatus = "AUTO";
              } else if (currentStatus === "None2") {
                currentStatus = "投入・灰出";
              }
              const modifiedData = {
                ...gasFurnaceData,
                運転状況: currentStatus,
              };
              return (
                <SensorCard
                  key={`gas_${suffix}`}
                  name={`乾溜ガス化炉${suffix}`}
                  data={modifiedData}
                />
              );
            })}
          </div>

          {/* Col 2: 乾溜空気弁 */}
          <div className="space-y-3">
            {sortedSuffixes.map((suffix) => (
              <SensorCard
                key={`air_${suffix}`}
                name={`乾溜空気弁${suffix}`}
                data={airValves[`乾溜空気弁${suffix}`]}
              />
            ))}
          </div>

          {/* Col 3: 燃焼炉 และ 排ガス濃度 */}
          <div className="space-y-3">
            {combustionFurnace && (
              <SensorCard
                name={combustionFurnace[0]}
                data={combustionFurnace[1]}
              />
            )}
            {(coValue !== undefined || o2Value !== undefined) && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                <h3 className="font-bold text-base text-gray-800">
                  排ガス濃度
                </h3>
                <dl className="mt-1.5 space-y-1 text-sm">
                  {coValue !== undefined && (
                    <div className="flex justify-between items-center">
                      <dt className="text-gray-500">CO濃度</dt>
                      <dd className="font-semibold">
                        {coValue}
                        <span className="text-xs text-gray-500 ml-1">ppm</span>
                      </dd>
                    </div>
                  )}
                  {o2Value !== undefined && (
                    <div className="flex justify-between items-center">
                      <dt className="text-gray-500">O2濃度</dt>
                      <dd className="font-semibold">
                        {o2Value}
                        <span className="text-xs text-gray-500 ml-1">%</span>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>

          {/* Col 4: Mini Chart */}
          <div className="bg-white border border-gray-200 rounded-lg p-2 h-full min-h-[300px] flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-base text-gray-800">
                過去6時間の推移
              </h3>
              <Link
                to={`/detail?model=${encodeURIComponent(plant.model)}`}
                target="_blank"
                className="inline-flex items-center p-1 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
                title="フルスクリーンで表示"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              </Link>
            </div>

            {/* ▼▼▼ อัปเกรดแล้ว: ส่ง plant.history (ที่ดึงมาแล้ว) ไปให้ MiniChart ▼▼▼ */}
            <MiniChart historyData={plant.history} modelName={plant.model} />
            {/* ▲▲▲ สิ้นสุดการอัปเกรด ▲▲▲ */}
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Component: การ์ด Plant (แบบที่ไม่มี Sensor)
 * (โค้ดส่วนนี้เหมือนเดิม)
 */
const OtherPlantCard = React.memo(({ plant }) => {
  const imageUrlPng = `${plant.image_url}.png`;
  const imageUrlJpg = `${plant.image_url}.jpg`;
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 text-center transition-shadow duration-200 hover:shadow-lg">
      <img
        src={imageUrlPng}
        alt={plant.customer}
        className="w-full h-auto object-cover rounded-md mb-2 max-h-32 mx-auto"
        onError={(e) => {
          if (!e.target.src.endsWith(".jpg")) {
            e.target.src = imageUrlJpg;
          } else {
            e.target.src =
              "https://placehold.co/300x225/e2e8f0/64748b?text=No+Image";
          }
        }}
      />
      <h3 className="text-lg font-bold text-gray-900">
        {plant.customer || "客先名不明"}
      </h3>
      <p className="text-sm text-gray-600">{plant.model || "-"}</p>
      <p className="text-xs text-gray-500">{plant.province || ""}</p>
    </div>
  );
});

//================================================
// Component หลักของหน้า (Dashboard)
//================================================
function Dashboard() {
  const [allPlants, setAllPlants] = useState([]);
  const [filteredPlants, setFilteredPlants] = useState({
    withSensors: [],
    otherPlants: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filterAndSplitPlants = useCallback((plants, query) => {
    const withSensors = [];
    const otherPlants = [];
    const q = (query || "").trim().toLowerCase();
    for (const plant of plants) {
      let matches = true;
      if (q) {
        matches =
          (plant.model || "").toLowerCase().includes(q) ||
          (plant.customer || "").toLowerCase().includes(q) ||
          (plant.province || "").toLowerCase().includes(q);
      }
      if (!matches) continue;
      const hasSensors = plant.sensors && Object.keys(plant.sensors).length > 0;
      if (hasSensors) {
        withSensors.push(plant);
      } else {
        otherPlants.push(plant);
      }
    }

    // ▼▼▼ ส่วนที่เพิ่ม/แก้ไข: การเรียงลำดับ (ล่าสุดอยู่บนสุด) ▼▼▼
    const sortPlants = (plantsArray) => {
        return plantsArray.sort((a, b) => {
            const timeA = new Date(a.last_updated || 0).getTime();
            const timeB = new Date(b.last_updated || 0).getTime();
            // เรียงจากมากไปน้อย (b - a)
            return timeB - timeA;
        });
    };

    const sortedWithSensors = sortPlants(withSensors);
    const sortedOtherPlants = sortPlants(otherPlants);
    // ▲▲▲ สิ้นสุดส่วนที่เพิ่ม/แก้ไข ▲▲▲


    return { withSensors: sortedWithSensors, otherPlants: sortedOtherPlants };
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // ▼▼▼ การยิง API ครั้งเดียวนี้ จะได้ข้อมูลกราฟมาด้วย ▼▼▼
      const response = await axios.get(GAS_API_URL, {
        params: { endpoint: "overview" },
      });
      const plants = response.data || [];
      setAllPlants(plants);
      setFilteredPlants(filterAndSplitPlants(plants, searchQuery));
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Initial load failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filterAndSplitPlants, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const refreshData = async () => {
      if (document.hidden) return;
      setIsRefreshing(true);
      try {
        const response = await axios.get(GAS_API_URL, {
          params: { endpoint: "overview" },
        });
        const plants = response.data || [];
        setAllPlants(plants);
        setFilteredPlants(filterAndSplitPlants(plants, searchQuery));
        setLastUpdated(new Date());
      } catch (e) {
        console.error("Auto-refresh failed:", e);
      } finally {
        setIsRefreshing(false);
      }
    };
    const interval = setInterval(refreshData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [filterAndSplitPlants, searchQuery]);

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setFilteredPlants(filterAndSplitPlants(allPlants, query));
  };
  const handleClearSearch = () => {
    setSearchQuery("");
    setFilteredPlants(filterAndSplitPlants(allPlants, ""));
  };
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchData().finally(() => setIsRefreshing(false));
  };

  return (
    <div className="bg-gray-100 text-gray-800 min-h-screen flex flex-col">
      {/* Header (เหมือนเดิม) */}
      <header className="border-b bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
          <a
            href="/"
            className="flex items-center gap-3 rounded-lg p-1 -ml-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <img
              src="/static/brand/logo.png"
              alt="株式会社キンセイ産業 ロゴ"
              className="h-10 w-auto"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">
                株式会社キンセイ産業
              </h1>
              <p className="text-sm text-gray-600">プラント稼働状況一覧</p>
            </div>
          </a>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 text-right hidden md:block">
              <p>最終更新 (UI):</p>
              <p id="last-updated-time" className="font-medium">
                {lastUpdated.toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <a
              href="https://docs.google.com/spreadsheets/d/1xIwNwQYTFK_psysG0kVI0N07BA2hbZkhAhqZ3_jJc2Y/edit?gid=1586518190#gid=1586518190"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-green-50 text-sm font-medium transition-colors"
              title="Google Sheet を開く"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 text-green-700"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
                <path d="M8 13h8"></path>
                <path d="M12 9v8"></path>
              </svg>
              データシート
            </a>
            <button
              id="manual-refresh-btn"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-sm font-medium disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`mr-2 ${isRefreshing ? "animate-spin" : ""}`}
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M3 21v-5h5"></path>
              </svg>
              更新
            </button>
          </div>
        </div>
      </header>

      {/* Main Content (เหมือนเดิม) */}
      <main className="flex-grow w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="relative">
            <input
              id="plant-search-input"
              type="text"
              placeholder="検索: 型式 / 客先名 / 都道府県"
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-64 pl-3 pr-10 py-1.5 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {searchQuery && (
              <button
                id="clear-search-btn"
                title="クリア"
                onClick={handleClearSearch}
                className="absolute right-0 top-0 mt-1 mr-1 px-2 py-1 text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {isLoading && (
          <div id="loading-state" className="text-center py-20">
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
            <p className="mt-3 text-base font-medium text-gray-600">
              データを読み込み中...
            </p>
          </div>
        )}
        {!isLoading && (
          <>
            <div id="plants-with-sensors-container">
              {filteredPlants.withSensors.map((plant) => (
                <PlantCard key={toSafeId(plant)} plant={plant} />
              ))}
            </div>
            {filteredPlants.otherPlants.length > 0 && (
              <div
                id="other-plants-section"
                className="mt-8 border-t pt-4 border-gray-300"
              >
                <h2
                  id="other-plants-title"
                  className="text-2xl font-bold mb-4 text-gray-700"
                >
                  その他のプラント
                </h2>
                <div
                  id="other-plants-container"
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                >
                  {filteredPlants.otherPlants.map((plant) => (
                    <OtherPlantCard key={toSafeId(plant)} plant={plant} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
