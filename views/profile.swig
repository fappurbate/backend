{% extends 'layout.swig' %}

{% block title %}Profile - Kothique Chaturbate Backend{% endblock %}

{% block content %}
  <div class="title">Profile - {{ broadcaster }}</div>

  <a href="/">broadcasters</a>
  <a href="/{{ broadcaster }}/tippers">tippers</a>
  <a href="/{{ broadcaster }}/animation">animation</a>
{% endblock %}
