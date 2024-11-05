(function() {
    // Define constants at the top inside the IIFE
    const SHOT_TYPES = [
        'Wide Shot',
        'Medium Shot', 
        'Close-up',
        'Extreme Close-up',
        'Over the Shoulder'
    ];

    const LIGHTING_TYPES = [
        'Natural',
        'High-key',
        'Low-key',
        'Hard',
        'Soft'
    ];

    const CAMERA_MOVEMENTS = [
        'Static',
        'Pan Left',
        'Pan Right',
        'Tilt Up',
        'Tilt Down',
        'Dolly In',
        'Dolly Out'
    ];

    // Style rules
    var style = document.createElement('style');
    style.innerHTML = `
    .shot-detection-container {
        padding: 20px;
        max-width: 800px;
        margin: 0 auto;
    }

    .annotation-panel {
        background: white;
        border: 2px solid #4285F4;
        border-radius: 8px;
        padding: 20px;
        margin-top: 20px;
    }

    .button-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0;
    }

    .annotation-button {
        padding: 6px 12px;
        border: 1px solid #4285F4;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .annotation-button.selected {
        background: #4285F4;
        color: white;
    }

    .shot-navigation {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }

    .current-time-info {
        text-align: center;
        font-size: 1.1em;
        color: #4285F4;
    }
    `;
    document.getElementsByTagName('head')[0].appendChild(style);

    // Component definition
    Vue.component('shot-detection-viz', {
        props: ['json_data', 'video_info'],
        data: function() {
            return {
                interval_timer: null,
                current_time: 0,
                keyListener: null,
                shotTypes: SHOT_TYPES,
                lightingTypes: LIGHTING_TYPES,
                cameraMovements: CAMERA_MOVEMENTS
            }
        },
        computed: {
            detected_shots: function() {
                if (!this.json_data.annotation_results)
                    return []

                for (let index = 0; index < this.json_data.annotation_results.length; index++) {
                    if ('shot_annotations' in this.json_data.annotation_results[index])
                        return this.json_data.annotation_results[index].shot_annotations
                }
                return []
            },
            currentShot: function() {
                if (!this.detected_shots) return null;
                
                const shot = this.detected_shots.find(element => {
                    const detected_shot = new Detected_Shot(element);
                    return detected_shot.within_time(this.current_time);
                });

                return shot ? new Detected_Shot(shot) : null;
            },
            currentShotIndex: function() {
                if (!this.currentShot) return -1;
                return this.detected_shots.findIndex(shot => 
                    nullable_time_offset_to_seconds(shot.start_time_offset) === this.currentShot.start_time
                );
            }
        },
        methods: {
            handleKeyDown: function(event) {
                if (event.key === 'ArrowLeft') {
                    this.jumpToPreviousShot();
                } else if (event.key === 'ArrowRight') {
                    this.jumpToNextShot();
                }
            },
            jumpToPreviousShot: function() {
                if (this.currentShotIndex > 0) {
                    const previousShot = new Detected_Shot(this.detected_shots[this.currentShotIndex - 1]);
                    this.$emit('shot-clicked', { seconds: previousShot.start_time });
                }
            },
            jumpToNextShot: function() {
                if (this.currentShotIndex < this.detected_shots.length - 1) {
                    const nextShot = new Detected_Shot(this.detected_shots[this.currentShotIndex + 1]);
                    this.$emit('shot-clicked', { seconds: nextShot.start_time });
                }
            },
            updateCharacteristic: function(type, value) {
                if (!this.currentShot) return;
                
                const shotIndex = this.currentShotIndex;
                if (shotIndex === -1) return;

                // Initialize characteristics if they don't exist
                if (!this.json_data.annotation_results[0].shot_annotations[shotIndex].characteristics) {
                    this.$set(this.json_data.annotation_results[0].shot_annotations[shotIndex], 'characteristics', {
                        shotType: '',
                        lighting: '',
                        cameraMovement: '',
                        notes: ''
                    });
                }

                // Update the characteristic
                this.$set(
                    this.json_data.annotation_results[0].shot_annotations[shotIndex].characteristics,
                    type,
                    value
                );

                this.$emit('json-modified', this.json_data);
            },
            handleDownloadJSON: function() {
                const dataStr = "data:text/json;charset=utf-8," + 
                    encodeURIComponent(JSON.stringify(this.json_data, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "video_annotations.json");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            }
        },
        template: `
            <div class="shot-detection-container" tabindex="0" @keydown="handleKeyDown">
                <div class="data-warning" v-if="detected_shots.length == 0">No shot data in JSON</div>

                <button 
                    class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2"
                    @click="handleDownloadJSON"
                    aria-label="Download modified JSON">
                    Download JSON
                </button>

                <div v-if="currentShot" class="annotation-panel">
                    <div class="shot-navigation">
                        <button 
                            @click="jumpToPreviousShot" 
                            class="px-3 py-1 bg-gray-100 rounded"
                            :disabled="currentShotIndex === 0">
                            ← Previous Shot
                        </button>
                        <div class="current-time-info">
                            Shot {{currentShotIndex + 1}} of {{detected_shots.length}}
                            <br>
                            {{currentShot.start_time.toFixed(2)}}s - {{currentShot.end_time.toFixed(2)}}s
                        </div>
                        <button 
                            @click="jumpToNextShot"
                            class="px-3 py-1 bg-gray-100 rounded"
                            :disabled="currentShotIndex === detected_shots.length - 1">
                            Next Shot →
                        </button>
                    </div>

                    <div class="mb-4">
                        <h3 class="text-lg font-semibold mb-2">Shot Type</h3>
                        <div class="button-group">
                            <button 
                                v-for="type in shotTypes"
                                :key="type"
                                @click="updateCharacteristic('shotType', type)"
                                class="annotation-button"
                                :class="{ selected: currentShot.characteristics?.shotType === type }">
                                {{ type }}
                            </button>
                        </div>
                    </div>

                    <div class="mb-4">
                        <h3 class="text-lg font-semibold mb-2">Lighting</h3>
                        <div class="button-group">
                            <button 
                                v-for="type in lightingTypes"
                                :key="type"
                                @click="updateCharacteristic('lighting', type)"
                                class="annotation-button"
                                :class="{ selected: currentShot.characteristics?.lighting === type }">
                                {{ type }}
                            </button>
                        </div>
                    </div>

                    <div class="mb-4">
                        <h3 class="text-lg font-semibold mb-2">Camera Movement</h3>
                        <div class="button-group">
                            <button 
                                v-for="movement in cameraMovements"
                                :key="movement"
                                @click="updateCharacteristic('cameraMovement', movement)"
                                class="annotation-button"
                                :class="{ selected: currentShot.characteristics?.cameraMovement === movement }">
                                {{ movement }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `,
        mounted: function() {
            console.log('mounted component')
            const component = this
            this.interval_timer = setInterval(function() {
                component.current_time = video.currentTime
            }, 1000 / 5)

            // Add focus to enable keyboard navigation
            this.$el.focus()
        },
        beforeDestroy: function() {
            console.log('destroying component')
            clearInterval(this.interval_timer)
        }
    });

    // Detected_Shot class definition
    class Detected_Shot {
        constructor(json_data) {
            this.start_time = nullable_time_offset_to_seconds(json_data.start_time_offset)
            this.end_time = nullable_time_offset_to_seconds(json_data.end_time_offset)
            this.duration = this.end_time - this.start_time
            this.current_shot = false
            this.characteristics = json_data.characteristics || {
                shotType: '',
                lighting: '',
                cameraMovement: '',
                notes: ''
            }
        }

        within_time(seconds) {
            return ((this.start_time <= seconds) && (this.end_time >= seconds))
        }
    }
})();