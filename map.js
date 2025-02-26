let trips = [];
let stations = [];
let filteredTrips = [];
let filteredStations = [];
let timeFilter = -1;
let radiusScale;
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Set Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWFyaWphLXZ1a2ljIiwiYSI6ImNtN2RubjdpejA1bDYybHB2emw5ZG5scWYifQ.uBTS-WONofhPlJZXLRgUcQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

map.on('load', async () => {
    console.log("Map loads!");

    // Load bike lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });

    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-width': 5,
            'line-opacity': 0.4,
            'line-color': 'green'
        }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-width': 5,
            'line-opacity': 0.4,
            'line-color': 'green'
        }
    });

    await loadData();
});

async function loadData() {
    try {
        const jsonUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        const trafficDataUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

        // Fetch station data
        const jsonData = await d3.json(jsonUrl);
        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        // Fetch trip data
        trips = await d3.csv(trafficDataUrl, (d) => ({
            ride_id: d.ride_id,
            bike_type: d.bike_type,
            started_at: new Date(d.started_at),
            ended_at: new Date(d.ended_at),
            start_station_id: d.start_station_id.trim(),
            end_station_id: d.end_station_id.trim(),
            is_member: +d.is_member
        }));

        console.log("Loaded Traffic Data:", trips.slice(0, 5));

        stations = computeStationTraffic(stations, trips);

        // Define radiusScale here to ensure it exists before usage
        radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, d => d.totalTraffic)])
            .range([0, 25]);

        console.log("Updated Stations with Traffic Data:", stations);
        displayStations(stations);
        updateTimeDisplay();

    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
    const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

    console.log('departure', departures)
    console.log('arrivals', arrivals)
    return stations.map(station => {
        let id = station.short_name;
        return {
            ...station,
            arrivals: arrivals.get(id) ?? 0,
            departures: departures.get(id) ?? 0,
            totalTraffic: (arrivals.get(id) ?? 0) + (departures.get(id) ?? 0)
        };
    });
}

function displayStations(stations) {
    console.log(stations);
    const svg = d3.select('#map').select('svg');

    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);
        const { x, y } = map.project(point);
        return { cx: x, cy: y };
    }

    const circles = svg.selectAll('circle')
        .data(stations, d => d.short_name)
        .join('circle')
        .attr('r', d => {
            const size = radiusScale(d.totalTraffic || 0);
            return isNaN(size) ? 3 : size;
        })
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('fill-opacity', 0.8)
        .attr('opacity', 0.8)
        .each(function (d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        })
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

    function updatePositions() {
        circles
            .attr('cx', d => getCoords(d).cx)
            .attr('cy', d => getCoords(d).cy);
    }

    updatePositions();
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTime() {
    console.log("Filtering trips for time:", timeFilter);

    filteredTrips = timeFilter === -1
        ? trips
        : trips.filter(trip => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });

    filteredStations = computeStationTraffic(stations, filteredTrips);
    updateScatterPlot();
}

function updateScatterPlot() {
    console.log("Updating scatter plot...");
    
    if (!radiusScale) {
        console.error("radiusScale is not defined yet.");
        return;
    }

    radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]);

    const svg = d3.select('#map').select('svg');
    const circles = svg.selectAll('circle')
        .data(filteredStations, d => d.short_name)
        .join('circle')
        .attr('r', d => {
            const size = radiusScale(d.totalTraffic || 0);
            return isNaN(size) ? 3 : size;
        })
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('fill-opacity', 0.8)
        .attr('opacity', 0.8)
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

    console.log("Scatter plot updated.");
}

// Time Slider Interactions
const timeSlider = document.getElementById("time-slider");
const selectedTime = document.getElementById("time-display");
const anyTimeLabel = document.getElementById("any-time-label");

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
        selectedTime.textContent = ''; 
        anyTimeLabel.style.display = 'block'; 
    } else {
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.style.display = 'none'; 
    }

    filterTripsByTime();
}

timeSlider.addEventListener("input", updateTimeDisplay);
