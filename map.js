//STEP 1.4
// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoibWFyaWphLXZ1a2ljIiwiYSI6ImNtN2RubjdpejA1bDYybHB2emw5ZG5scWYifQ.uBTS-WONofhPlJZXLRgUcQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

//STEP 2
map.on('load', () => { 
    console.log("Map loads!");

    // Define a shared bike lane style
    const bikeLaneStyle = {
        'line-width': 5,         // Thicker lines
        'line-opacity': 0.4,      // Slight transparency
        'line-color': '#FF00FF'  // magenta
    };

    // Add Boston bike lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });

    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            ...bikeLaneStyle,  
        }
    });

    console.log("Boston bike lanes added!");

    // Add Cambridge bike lanes
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            ...bikeLaneStyle, 
        }
    });

    console.log("Cambridge bike lanes added!");

});

//STEP 3
//3.1
map.on('load', () => {
    console.log("Map loads!");

    const jsonUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const trafficDataUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    let departures, arrivals, totalTraffic;

    d3.json(jsonUrl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);

        let stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        // Fetch Traffic Data and Compute Traffic Volumes
        d3.csv(trafficDataUrl).then(data => {
            const trips = data.map(d => ({
                ride_id: d.ride_id,
                bike_type: d.bike_type,
                started_at: d.started_at,
                ended_at: d.ended_at,
                start_station_id: d.start_station_id.trim(),
                end_station_id: d.end_station_id.trim(),
                is_member: +d.is_member
            }));

            console.log("Loaded Traffic Data:", trips.slice(0, 5));

            // Compute Departures and Arrivals
            departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
            arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

            totalTraffic = new Map();
            departures.forEach((value, key) => {
                totalTraffic.set(key, { departures: value, arrivals: arrivals.get(key) || 0 });
            });
            arrivals.forEach((value, key) => {
                if (!totalTraffic.has(key)) {
                    totalTraffic.set(key, { departures: 0, arrivals: value });
                }
            });

            console.log("Departures:", departures);
            console.log("Arrivals:", arrivals);
            console.log("Total Traffic:", totalTraffic);

            stations = stations.map(station => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });

            console.log("Updated Stations with Traffic Data:", stations);

            displayStations(stations);
            console.log("Station Traffic Values:", stations.map(d => d.totalTraffic));
            console.log("Max Traffic:", d3.max(stations, d => d.totalTraffic));


        }).catch(error => {
            console.error('Error loading Traffic Data:', error);
        });

    }).catch(error => {
        console.error('Error loading JSON:', error);
    });

});


function displayStations(stations){
    // 3.3
    console.log(stations)
    const svg = d3.select('#map').select('svg');

    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
        const { x, y } = map.project(point);  // Project to pixel coordinates
        return { cx: x, cy: y };  // Return as object for use in SVG attributes
    }
    
    // 4.3
    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

    // Append circles to the SVG for each station
    const circles = svg.selectAll('circle')
        .data(stations)
        .enter()
        .append('circle')
        .attr('r', d => {
            const size = radiusScale(d.totalTraffic);
            // console.log(`Station ${d.short_name}: TotalTraffic = ${d.totalTraffic}, Radius = ${size}`);
            return size;
        })
        // .attr('r', 5)               // Radius of the circle
        .attr('fill', 'steelblue')  // Circle fill color
        .attr('stroke', 'white')    // Circle border color
        .attr('stroke-width', 1)    // Circle border thickness
        .attr('fill-opacity', 0.6) // 4.3
        .attr('opacity', 0.8)      // Circle opacity
        //4.4
        .style('pointer-events', 'auto')
        .each(function(d) {
            d3.select(this)
                .append('title')  
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });

    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
        circles
        .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
        .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
    }

    // Initial position update when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions);     // Update during map movement
    map.on('zoom', updatePositions);     // Update during zooming
    map.on('resize', updatePositions);   // Update on window resize
    map.on('moveend', updatePositions);  // Final adjustment after movement ends

}

// 5.1
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeText = document.getElementById('any-time');

timeSlider.addEventListener('input', () => {
    if (timeSlider.value == -1) {
        selectedTime.style.display = 'none'; // Hide time
        anyTimeText.style.display = 'block'; // Show (any time)
    } else {
        selectedTime.style.display = 'block'; // Show time
        anyTimeText.style.display = 'none'; // Hide (any time)

        let hours = Math.floor(timeSlider.value / 60);
        let minutes = timeSlider.value % 60;
        let ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12; // Convert to 12-hour format
        minutes = minutes.toString().padStart(2, '0');

        selectedTime.textContent = `${hours}:${minutes} ${ampm}`;
    }
});
