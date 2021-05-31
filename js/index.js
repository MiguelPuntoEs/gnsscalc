const MILLISECONDS_IN_WEEK = 7 * 24 * 3600 * 1000;
const SECONDS_IN_WEEK = 604800;
const SECONDS_IN_MINUTE = 60
const SECONDS_IN_HOUR = 3600
const SECONDS_IN_DAY = 86400
const MILLISECONDS_IN_DAY = 86400000
const SECONDS_TT_TAI = 32.184
const START_LEAP_SECS_GPS = 19
const START_GPS_TIME = new Date(Date.UTC(1980, 0, 6, 0, 0, 0, 0));
const START_GAL_TIME = new Date(Date.UTC(1999, 7, 22, 0, 0, 0));
const START_BDS_TIME = new Date(Date.UTC(2006, 0, 1, 0, 0, 0));
const START_MJD2000_TIME = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const START_GLO_LEAP = new Date(Date.UTC(1996, 0, 1, 0, 0, 0, 0));

let useLeaps = false;


function computeDayOfYear(date) {
	day = date.getUTCDate();
	month = date.getUTCMonth() + 1;
	year = date.getUTCFullYear();

	N1 = Math.floor(275 * month / 9);
	N2 = Math.floor((month + 9) / 12);
	N3 = (1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3));
	N = N1 - (N2 * N3) + day - 30;
	return N;
}

function getWeekNumber(date) {
	return Math.floor(getGpsTime(date) / MILLISECONDS_IN_WEEK);
}

function getTimeOfWeek(date) {
	return Math.floor((getGpsTime(date) % MILLISECONDS_IN_WEEK) / 1000);
}

function getGpsTime(date) {
	var leaps_gps = (getLeapSeconds(date) - START_LEAP_SECS_GPS) * 1000;
	var time_ms = useLeaps ? date.getTime() - START_GPS_TIME.getTime() + leaps_gps : date.getTime() - START_GPS_TIME.getTime();
	return time_ms;
}

function getGalTime(date) {
	var leaps_gps = (getLeapSeconds(date) - START_LEAP_SECS_GPS) * 1000;
	var time_ms = useLeaps ? date.getTime() - START_GAL_TIME.getTime() + leaps_gps : date.getTime() - START_GAL_TIME.getTime();
	return time_ms;
}

function getBdsTime(date) {
	var leaps_gps = (getLeapSeconds(date) - START_LEAP_SECS_GPS) * 1000;
	var time_ms = useLeaps ? date.getTime() - START_BDS_TIME.getTime() + leaps_gps : date.getTime() - START_BDS_TIME.getTime();
	return time_ms;
}

function getDateFromGpsData(weekNumber, timeOfWeek) {
	return new Date(weekNumber * MILLISECONDS_IN_WEEK + timeOfWeek * 1000 + START_GPS_TIME.getTime())
}

function getDateFromGpsTime(gpsTime) {
	var leaps_gps = (getLeapSeconds(date) - START_LEAP_SECS_GPS) * 1000;
	var date = useLeaps ? new Date(gpsTime + START_GPS_TIME.getTime() + leaps_gps) : new Date(gpsTime + START_GPS_TIME.getTime());
	return date;
}

function getDateFromGalTime(galTime) {
	return new Date(galTime + START_GAL_TIME.getTime())
}

function getDateFromBdsTime(bdsTime) {
	return new Date(bdsTime + START_BDS_TIME.getTime())
}

function getTimeOfDay(date) {
	dateInitialDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
	return Math.floor((date.getTime() - dateInitialDay.getTime()) / 1000)
}

function getGloN4(date) {
	return Math.floor((date.getUTCFullYear() - START_GLO_LEAP.getFullYear()) / 4)
}

function getGloNA(date) {
	n4 = getGloN4(date)

	init4YearPeriod = moment(START_GLO_LEAP).add(n4 * 4, 'year').utc()

	return Math.floor(moment.duration(moment(date).diff(init4YearPeriod)).asDays() + 1)
}

function getDateFromGloN(n4, na, tod) {
	return moment.utc(START_GLO_LEAP).add(n4 * 4, 'year').add(na - 1, 'day').add(tod, 'second').toDate()
}

document.addEventListener("DOMContentLoaded", (event) => {
	init();
});


function init() {

	document.querySelectorAll('.now').forEach(
		(element) => element.addEventListener('click', (e) => {
			setValues(new Date(), e.target.parentElement);
		})
	);

	document.querySelectorAll('.rinex').forEach(
		(element) => element.addEventListener('change', (e) => {
			setValues(moment.utc(e.target.value, "YYYY MM DD HH mm ss.SSSSSSS").toDate(), e.target.parentElement);
		})
	);
	

	document.querySelectorAll('.week_number, .time_of_week').forEach(
		(element) => element.addEventListener('change', (e) => {
			const form = e.target.parentElement;
			setValues(getDateFromGpsData(form.querySelector(".week_number").value,
				form.querySelector(".time_of_week").value),
				form);
		}));

	document.querySelectorAll('.glo_n4, .glo_na').forEach(
		(element) => element.addEventListener('change', (e) => {
			const form = e.target.parentElement;
			const n4 = form.querySelector(".glo_n4").value
			const na = form.querySelector(".glo_na").value
			const tod = form.querySelector(".time_of_day").value
			setValues(getDateFromGloN(n4, na, tod), form)
		}));


	document.querySelectorAll('.date, .time').forEach(
		(element) => element.addEventListener('change', (e) => {
			const form = e.target.parentElement;
			const date = form.querySelector(".date").value
			const time = form.querySelector(".time").value
			setValues(moment.utc(`${date} ${time}`, "YYYY-MM-DD HH:mm:ss").toDate(), form)
		}));

	document.querySelectorAll('form.container input').forEach(
		(element) => element.addEventListener('change', (e) => {
			const form = e.target.parentElement;

			switch (element.className) {
				case 'gps_time':
					setValues(getDateFromGpsTime(element.value * 1000), form);
					break;
				case 'gal_time':
					setValues(getDateFromGalTime(element.value * 1000), form);
					break;
				case 'bds_time':
					setValues(getDateFromBdsTime(element.value * 1000), form);
					break;
				case 'unix_time':
					setValues(new Date(element.value * 1000), form)
					break;
				case 'day_of_year':
					setValues(moment.utc(`${form.querySelector(".date").value} ${form.querySelector(".time").value}`, "YYYY-MM-DD HH:mm:ss").dayOfYear(element.value).toDate(),
						form);
					break;
				case 'week_of_year':
					setValues(moment.utc(`${form.querySelector(".date").value} ${form.querySelector(".time").vaue}`, "YYYY-MM-DD HH:mm:ss").weeks(element.value).toDate(),
						form);
					break;
				case 'time_of_day':
					setValues(moment.utc(form.querySelector(".date").value, "YYYY-MM-DD").add(element.value, 's').toDate(),
						form);
					break;
				case 'day_of_week':
					setValues(moment.utc(`${form.querySelector(".date").value} ${form.querySelector(".time").value}`, "YYYY-MM-DD HH:mm:ss").day(element.value).toDate(),
						form);
					break;
				case 'julian_date':
					setValues(new Date((element.value - 2440587.5) * MILLISECONDS_IN_DAY),
						form);
					break;
				case 'mjd':
					setValues(new Date((element.value - 40587) * MILLISECONDS_IN_DAY),
						form);
					break;
				case 'mjd_2000':
					setValues(new Date((element.value - 40587 + 51544) * MILLISECONDS_IN_DAY),
						form);
					break;
				case 'hour_code':
					hour = ALPHABET.indexOf(element.value);
					if (hour != -1) {
						setValues(moment.utc(`${form.querySelector(".date").value} ${element.value}`, "YYYY-MM-DD HH:mm:ss").hours(hour).toDate(),
							form);
					}
					else {
						alert("Error: Invalid hour code")
					}
					break;
				default:
					break;
			}
		}));

	document.querySelectorAll('.rnx').forEach((element) => {
		element.addEventListener('click', (e) => {
			const form = e.target.parentElement;
			const date = moment.utc(`${form.querySelector(".date").value} ${form.querySelector(".time").value}`, "YYYY-MM-DD HH:mm:ss").toDate();
			const date_rnx = moment(date).utc().format('> YYYY MM DD HH mm ss.SSSSSSS');

			rinex = form.querySelector('.rinex');
			rinex.focus()
			rinex.select()

			try {
				var successful = document.execCommand('copy');
				var msg = successful ? 'successful' : 'unsuccessful';

				// Clear selection
				if (window.getSelection) {
					if (window.getSelection().empty) {  // Chrome
					  window.getSelection().empty();
					} else if (window.getSelection().removeAllRanges) {  // Firefox
					  window.getSelection().removeAllRanges();
					}
				  } else if (document.selection) {  // IE?
					document.selection.empty();
				  }

				
			  } catch (err) {
				console.log('Oops, unable to copy');
			  }
			
		});

	});

	document.querySelector('.reset').addEventListener('click', (e) => {
		setValues(new Date(getDateFromGpsTime(document.querySelector("#initial_time .gps_time").value * 1000)), document.querySelector("#final_time"))

	});

	document.querySelector('#time_difference').addEventListener('change', (e) => {
		const gpsSeconds = Number(document.querySelector("#initial_time .gps_time").value) +
			Number(document.querySelector("#seconds_difference").value) +
			Number(document.querySelector("#minutes_difference").value) * SECONDS_IN_MINUTE +
			Number(document.querySelector("#hours_difference").value) * SECONDS_IN_HOUR +
			Number(document.querySelector("#days_difference").value) * SECONDS_IN_DAY +
			Number(document.querySelector("#weeks_difference").value) * SECONDS_IN_WEEK;
			setValues(getDateFromGpsTime(gpsSeconds * 1000), document.querySelector('#final_time'))
			setTimeDifference()
	});


}


function setValues(date, form) {
	form.querySelector('.week_number').value = getWeekNumber(date)
	form.querySelector('.time_of_week').value = Math.floor(getTimeOfWeek(date))
	form.querySelector('.date').value = moment(date).utc().format('YYYY-MM-DD')
	form.querySelector('.time').value = moment(date).utc().format('HH:mm:ss')
	form.querySelector('.day_of_year').value = moment(date).utc().dayOfYear()
	form.querySelector('.week_of_year').value = moment(date).utc().weeks()
	form.querySelector('.time_of_day').value = getTimeOfDay(date)
	form.querySelector('.day_of_week').value = date.getUTCDay()
	form.querySelector('.hour_code').value = ALPHABET[date.getUTCHours()]
	form.querySelector('.julian_date').value = (date.getTime() / MILLISECONDS_IN_DAY + 2440587.5).toFixed(6)
	form.querySelector('.mjd').value = (date.getTime() / MILLISECONDS_IN_DAY + 40587).toFixed(3)
	form.querySelector('.mjd_2000').value = (date.getTime() / MILLISECONDS_IN_DAY + 40587 - 51544).toFixed(3)
	form.querySelector('.leap_sec').value = getLeapSeconds(date) + " [TAI], " + (getLeapSeconds(date) - START_LEAP_SECS_GPS) + " [GPS]"
	form.querySelector('.gps_time').value = Math.floor(getGpsTime(date) / 1000)
	form.querySelector('.gal_time').value = Math.floor(getGalTime(date) / 1000)
	form.querySelector('.bds_time').value = Math.floor(getBdsTime(date) / 1000)
	form.querySelector('.unix_time').value = Math.floor(date.getTime() / 1000)
	form.querySelector('.glo_n4').value = getGloN4(date)
	form.querySelector('.glo_na').value = getGloNA(date)
	form.querySelector('.date_tai').value = moment(date).add(getLeapSeconds(date), 'seconds').utc().format('YYYY-MM-DD')
	form.querySelector('.time_tai').value = moment(date).add(getLeapSeconds(date), 'seconds').utc().format('HH:mm:ss')
	form.querySelector('.date_tt').value = moment(date).add(getLeapSeconds(date) + SECONDS_TT_TAI, 'seconds').utc().format('YYYY-MM-DD')
	form.querySelector('.time_tt').value = moment(date).add(getLeapSeconds(date) + SECONDS_TT_TAI, 'seconds').utc().format('HH:mm:ss.SSS')
	form.querySelector('.rinex').value = moment(date).utc().format('> YYYY MM DD HH mm ss.SSSSSSS')
	setTimeDifference()
}

function getLeapSecondsFromTAI(date) {
	leaps_tai = getLeapSeconds(date);
	date_utc = moment(date).subtract(leaps_tai, 'seconds').utc().toDate();
	leaps_utc = getLeapSeconds(date_utc);
	date_tai_ = moment(date).add(leaps_utc, 'seconds').utc().toDate();

	if (date_tai_ == date) {
		return leaps_tai;
	}
	else if (date_tai_ < date) {
		return leaps_tai - 1;
	}


}

function getLeapSeconds(date) {
	if (date >= Date.UTC(1900, 0, 1) + 3692217600000) {
		return 37;
	} else if (date >= Date.UTC(1900, 0, 1) + 3644697600000) {
		return 36;
	} else if (date >= Date.UTC(1900, 0, 1) + 3550089600000) {
		return 35;
	} else if (date >= Date.UTC(1900, 0, 1) + 3439756800000) {
		return 34;
	} else if (date >= Date.UTC(1900, 0, 1) + 3345062400000) {
		return 33;
	} else if (date >= Date.UTC(1900, 0, 1) + 3124137600000) {
		return 32;
	} else if (date >= Date.UTC(1900, 0, 1) + 3076704000000) {
		return 31;
	} else if (date >= Date.UTC(1900, 0, 1) + 3029443200000) {
		return 30;
	} else if (date >= Date.UTC(1900, 0, 1) + 2982009600000) {
		return 29;
	} else if (date >= Date.UTC(1900, 0, 1) + 2950473600000) {
		return 28;
	} else if (date >= Date.UTC(1900, 0, 1) + 2918937600000) {
		return 27;
	} else if (date >= Date.UTC(1900, 0, 1) + 2871676800000) {
		return 26;
	} else if (date >= Date.UTC(1900, 0, 1) + 2840140800000) {
		return 25;
	} else if (date >= Date.UTC(1900, 0, 1) + 2776982400000) {
		return 24;
	} else if (date >= Date.UTC(1900, 0, 1) + 2698012800000) {
		return 23;
	} else if (date >= Date.UTC(1900, 0, 1) + 2634854400000) {
		return 22;
	} else if (date >= Date.UTC(1900, 0, 1) + 2603318400000) {
		return 21;
	} else if (date >= Date.UTC(1900, 0, 1) + 2571782400000) {
		return 20;
	} else if (date >= Date.UTC(1900, 0, 1) + 2524521600000) {
		return 19;
	} else if (date >= Date.UTC(1900, 0, 1) + 2492985600000) {
		return 18;
	} else if (date >= Date.UTC(1900, 0, 1) + 2461449600000) {
		return 17;
	} else if (date >= Date.UTC(1900, 0, 1) + 2429913600000) {
		return 16;
	} else if (date >= Date.UTC(1900, 0, 1) + 2398291200000) {
		return 15;
	} else if (date >= Date.UTC(1900, 0, 1) + 2366755200000) {
		return 14;
	} else if (date >= Date.UTC(1900, 0, 1) + 2335219200000) {
		return 13;
	} else if (date >= Date.UTC(1900, 0, 1) + 2303683200000) {
		return 12;
	} else if (date >= Date.UTC(1900, 0, 1) + 2287785600000) {
		return 11;
	} else if (date >= Date.UTC(1900, 0, 1) + 2272060800000) {
		return 10;
	} else {
		return 0;
	}
}


function setTimeDifference() {
	const gpsFinalTime = document.querySelector("#final_time .gps_time").value;
	const gpsInitialTime = document.querySelector("#initial_time .gps_time").value;


	mSign = Math.sign(gpsFinalTime - gpsInitialTime);
	timeDifference = Math.abs(gpsFinalTime - gpsInitialTime);

	document.querySelector("#seconds_difference").value = mSign * (timeDifference % SECONDS_IN_MINUTE);
	document.querySelector("#minutes_difference").value = mSign * Math.floor((timeDifference % SECONDS_IN_HOUR) / SECONDS_IN_MINUTE);
	document.querySelector("#hours_difference").value = mSign * Math.floor((timeDifference % SECONDS_IN_DAY) / SECONDS_IN_HOUR);
	document.querySelector("#days_difference").value = mSign * Math.floor((timeDifference % SECONDS_IN_WEEK) / SECONDS_IN_DAY);
	document.querySelector("#weeks_difference").value = mSign * Math.floor((timeDifference) / SECONDS_IN_WEEK);
}

setTimeDifference()