/**
 * charts.js – Chart.js wrapper for engagement and contribution charts
 * Used on the summary.html page
 */

window.SMCharts = (() => {

    let engagementChart = null;
    let contributionChart = null;

    /** Chart.js default config for dark theme */
    const baseChartConfig = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#a8b2d8', font: { family: 'Inter', size: 12 } },
            },
            tooltip: {
                backgroundColor: 'rgba(15, 15, 42, 0.95)',
                borderColor: 'rgba(108, 99, 255, 0.4)',
                borderWidth: 1,
                titleColor: '#fff',
                bodyColor: '#a8b2d8',
                cornerRadius: 8,
                padding: 12,
            },
        },
    };

    /**
     * Render horizontal bar chart for engagement scores
     * @param {string} canvasId
     * @param {Array<{userName, engagementScore}>} data
     */
    const renderEngagementChart = (canvasId, data) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !data?.length) return;

        if (engagementChart) engagementChart.destroy();

        const labels = data.map((d) => d.userName);
        const scores = data.map((d) => d.engagementScore);

        const colors = data.map((_, i) => {
            const palette = ['#6c63ff', '#00d4aa', '#ff6b6b', '#ffa94d', '#51cf66', '#7c8de8'];
            return palette[i % palette.length];
        });

        engagementChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Engagement Score (%)',
                        data: scores,
                        backgroundColor: colors.map((c) => c + '55'),
                        borderColor: colors,
                        borderWidth: 2,
                        borderRadius: 8,
                    },
                ],
            },
            options: {
                ...baseChartConfig,
                indexAxis: 'y',
                scales: {
                    x: {
                        min: 0, max: 100,
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        ticks: { color: '#a8b2d8', font: { family: 'Inter', size: 11 } },
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#fff', font: { family: 'Inter', size: 12, weight: '600' } },
                    },
                },
            },
        });
    };

    /**
     * Render doughnut chart for contribution breakdown
     * @param {string} canvasId
     * @param {Array<{userName, contributionPercentage}>} data
     */
    const renderContributionChart = (canvasId, data) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !data?.length) return;

        if (contributionChart) contributionChart.destroy();

        const palette = ['#6c63ff', '#00d4aa', '#ff6b6b', '#ffa94d', '#51cf66', '#a855f7'];
        const labels = data.map((d) => d.userName);
        const values = data.map((d) => d.contributionPercentage || Math.round(d.speakingTime));

        contributionChart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [
                    {
                        data: values,
                        backgroundColor: palette.map((c) => c + '88'),
                        borderColor: palette,
                        borderWidth: 2,
                        hoverOffset: 8,
                    },
                ],
            },
            options: {
                ...baseChartConfig,
                cutout: '65%',
                plugins: {
                    ...baseChartConfig.plugins,
                    tooltip: {
                        ...baseChartConfig.plugins.tooltip,
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%`,
                        },
                    },
                },
            },
        });
    };

    return { renderEngagementChart, renderContributionChart };
})();
